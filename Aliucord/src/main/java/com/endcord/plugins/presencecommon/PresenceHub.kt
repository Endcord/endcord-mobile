/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.presencecommon

import android.os.SystemClock
import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.api.PatcherAPI
import com.aliucord.patcher.before
import com.discord.api.activity.Activity
import com.discord.api.activity.ActivityType
import com.discord.api.presence.ClientStatus
import com.discord.stores.StoreGatewayConnection
import com.discord.stores.StoreStream
import java.util.regex.Pattern

/**
 * The one place Endcord changes the presence the app sends.
 *
 * The app keeps a single local presence and sends it with `StoreGatewayConnection.presenceUpdate` whenever it
 * changes (Spotify, custom status, status). Its own `StoreUserPresence.updateActivity` keeps one activity per
 * type, so two plugins using it would overwrite each other. Instead every plugin hands its activities to this hub,
 * and one hook on `presenceUpdate` sends the app's activities, minus the filtered ones, plus every plugin's.
 */
internal object PresenceHub {
    private val logger = Logger("Endcord/PresenceHub")

    /** Plugin name -> the activities it wants shown, in registration order. */
    private val provided = LinkedHashMap<String, List<Activity>>()

    /** Plugin name -> returns false for activities that must not be sent. Custom statuses are never filtered. */
    private val filters = LinkedHashMap<String, (Activity) -> Boolean>()

    /**
     * Signatures of the activities the hub added. Discord sends your session's activities back and the app copies
     * them into its local presence, so without this an activity a plugin removed would keep coming back.
     */
    private val emitted = LinkedHashSet<String>()

    private var patched = false
    private var refreshPending = false
    private var lastRefresh = 0L

    /** Sets the activities of [owner], replacing the previous ones, and sends the new presence. */
    fun setActivities(owner: String, activities: List<Activity>) {
        synchronized(this) {
            ensurePatched()
            if (activities.isEmpty()) {
                if (provided.remove(owner) == null) return
            } else {
                if (provided[owner] == activities) return
                provided[owner] = ArrayList(activities)
                for (activity in activities) remember(Activities.signature(activity))
            }
        }
        refresh()
    }

    fun setActivity(owner: String, activity: Activity?) =
        setActivities(owner, if (activity == null) emptyList() else listOf(activity))

    /** Hides every activity for which [keep] returns false, until [unregisterAll] is called for [owner]. */
    fun setFilter(owner: String, keep: (Activity) -> Boolean) {
        synchronized(this) {
            ensurePatched()
            filters[owner] = keep
        }
        refresh()
    }

    /** Removes the activities and the filter of [owner]. */
    fun unregisterAll(owner: String) {
        val changed = synchronized(this) { (provided.remove(owner) != null) or (filters.remove(owner) != null) }
        if (changed) refresh()
    }

    /** Whether the app itself (not an Endcord plugin) currently shows an activity of [type], such as Spotify. */
    fun appHasActivity(type: ActivityType?): Boolean {
        val local = StoreStream.getPresences().localPresence?.activities ?: return false
        return synchronized(this) {
            local.any { a ->
                a.p() != ActivityType.CUSTOM_STATUS && (type == null || a.p() == type) && Activities.signature(a) !in emitted
            }
        }
    }

    /** Whether a plugin other than [owner] provides an activity. */
    fun othersProvide(owner: String): Boolean = synchronized(this) { provided.keys.any { it != owner } }

    private fun remember(signature: String) {
        emitted.remove(signature)
        emitted.add(signature)
        if (emitted.size > MAX_SIGNATURES) emitted.remove(emitted.iterator().next())
    }

    private fun keep(activity: Activity): Boolean {
        if (activity.p() == ActivityType.CUSTOM_STATUS) return true
        for (filter in filters.values) {
            try {
                if (!filter(activity)) return false
            } catch (e: Throwable) {
                logger.error("An activity filter failed", e)
            }
        }
        return true
    }

    /** What actually gets sent, given the activities the app wanted to send. */
    private fun merge(original: List<Activity>?): List<Activity> = synchronized(this) {
        val out = ArrayList<Activity>()
        original?.forEach { if (Activities.signature(it) !in emitted && keep(it)) out.add(it) }
        for (activities in provided.values) activities.forEach { if (keep(it)) out.add(it) }
        out
    }

    @Synchronized
    private fun ensurePatched() {
        if (patched) return
        patched = true
        PatcherAPI(logger).before<StoreGatewayConnection>(
            "presenceUpdate",
            ClientStatus::class.java,
            Long::class.javaObjectType,
            List::class.java,
            Boolean::class.javaObjectType,
        ) { param ->
            try {
                @Suppress("UNCHECKED_CAST")
                val activities = merge(param.args[2] as List<Activity>?)
                param.args[2] = activities
                // Discord echoes your session's activities back and the app may resend them when they differ only
                // by the server's timestamps. Dropping an identical resend right away keeps that from looping.
                val key = param.args[0].toString() + "|" +
                    activities.joinToString("\n") { CREATED_AT.matcher(it.toString()).replaceAll("") }
                val now = SystemClock.elapsedRealtime()
                synchronized(PresenceHub) {
                    if (key == lastSentKey && now - lastSentAt < DUPLICATE_WINDOW_MS) {
                        param.result = true
                        return@before
                    }
                    lastSentKey = key
                    lastSentAt = now
                }
            } catch (e: Throwable) {
                logger.error("Failed to merge the outgoing presence", e)
            }
        }
    }

    private var lastSentKey: String? = null
    private var lastSentAt = 0L
    private val CREATED_AT = Pattern.compile("createdAt=-?\\d+")

    /**
     * Resends the local presence so the hook above runs. Coalesced and spaced out so plugins can never hit the
     * gateway's rate limit, however often they call it.
     */
    fun refresh() {
        synchronized(this) {
            if (refreshPending) return
            refreshPending = true
        }
        val wait = (lastRefresh + MIN_INTERVAL_MS - SystemClock.elapsedRealtime()).coerceAtLeast(DEBOUNCE_MS)
        Utils.mainThread.postDelayed({
            synchronized(this) {
                refreshPending = false
                lastRefresh = SystemClock.elapsedRealtime()
            }
            try {
                StoreStream.getDispatcherYesThisIsIntentional().schedule {
                    try {
                        val local = StoreStream.getPresences().localPresence
                        StoreStream.getGatewaySocket().presenceUpdate(local?.status, null, local?.activities, null)
                    } catch (e: Throwable) {
                        logger.error("Failed to send the presence", e)
                    }
                }
            } catch (e: Throwable) {
                logger.error("Failed to schedule a presence update", e)
            }
        }, wait)
    }

    private const val MAX_SIGNATURES = 200
    private const val DEBOUNCE_MS = 1_000L
    private const val MIN_INTERVAL_MS = 5_000L
    private const val DUPLICATE_WINDOW_MS = 3_000L
}
