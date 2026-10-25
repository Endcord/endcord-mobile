/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.lastonline

import android.content.Context
import android.os.SystemClock
import android.view.View
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.wrappers.ChannelWrapper.Companion.recipientIds
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.discord.api.presence.ClientStatus
import com.discord.api.presence.ClientStatuses
import com.discord.databinding.WidgetChannelsListItemChannelPrivateBinding
import com.discord.stores.StoreChannels
import com.discord.stores.StoreStream
import com.discord.stores.StoreUserPresence
import com.discord.utilities.view.extensions.ViewExtensions
import com.discord.widgets.channels.list.WidgetChannelsListAdapter
import com.discord.widgets.channels.list.items.ChannelListItem
import com.discord.widgets.channels.list.items.ChannelListItemPrivate
import com.endcord.plugins.identitycommon.Members
import org.json.JSONObject
import java.lang.reflect.Field
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

internal class LastOnline : EndcordPlugin(
    name = "LastOnline",
    description = "Adds a last online indicator under usernames in your DM list",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("friends", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            "persistAcrossRestarts",
            "Save last online times to a local database so they stay accurate across restarts",
            default = true,
        ),
    )

    /** User id -> when they went offline, or [ONLINE] while they are online. Written on the store thread. */
    private val lastOffline = ConcurrentHashMap<Long, Long>()
    private val saveScheduled = AtomicBoolean(false)

    /**
     * Recipients of your 1:1 DMs, the only users the indicator is shown for. The store reports the presence of
     * every server member it sees, so tracking all of them would grow without end and save constantly.
     */
    @Volatile private var dmUsers: Set<Long> = emptySet()
    @Volatile private var dmUsersAt = 0L

    private fun isDmUser(userId: Long): Boolean {
        val now = SystemClock.elapsedRealtime()
        if (dmUsersAt == 0L || now - dmUsersAt > if (dmUsers.isEmpty()) 5_000L else 60_000L) {
            dmUsersAt = now
            dmUsers = StoreStream.getChannels().getChannelsForGuild(StoreChannels.PRIVATE_CHANNELS_ID)?.values
                ?.filter { it.type == Members.TYPE_DM }
                ?.mapNotNullTo(HashSet()) { it.recipientIds.firstOrNull() }
                ?: emptySet()
        }
        return userId in dmUsers
    }

    private fun load() {
        lastOffline.clear()
        if (!bool("persistAcrossRestarts")) return
        try {
            val json = JSONObject(settings.getString(SAVED_KEY, "{}") ?: "{}")
            val now = System.currentTimeMillis()
            val keys = json.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val id = key.toLongOrNull() ?: continue
                val time = json.optLong(key)
                if (time > 0 && now - time <= MAX_DISPLAY_AGE) lastOffline[id] = time
            }
        } catch (e: Throwable) {
            logger.error("Failed to read saved last online times", e)
        }
    }

    /** Saves at most every 30 seconds, off the main thread, like Endcord PC's batched writes. */
    private fun scheduleSave() {
        if (!bool("persistAcrossRestarts") || !saveScheduled.compareAndSet(false, true)) return
        Utils.mainThread.postDelayed({
            Utils.threadPool.execute {
                saveScheduled.set(false)
                try {
                    val now = System.currentTimeMillis()
                    val json = JSONObject()
                    for ((id, time) in lastOffline) {
                        if (time != ONLINE && now - time <= MAX_DISPLAY_AGE) json.put(id.toString(), time)
                    }
                    settings.setString(SAVED_KEY, json.toString())
                } catch (e: Throwable) {
                    logger.error("Failed to save last online times", e)
                }
            }
        }, SAVE_DELAY_MS)
    }

    /** Port of handlePresenceUpdate. A first sighting while offline records nothing: the time is unknown. */
    private fun onPresence(userId: Long, status: ClientStatus?) {
        if (!isDmUser(userId)) return
        val offline = status == null || status == ClientStatus.OFFLINE || status == ClientStatus.INVISIBLE
        val previous = lastOffline[userId]
        if (!offline) {
            if (previous != ONLINE) {
                lastOffline[userId] = ONLINE
                scheduleSave()
            }
        } else if (previous == ONLINE) {
            lastOffline[userId] = System.currentTimeMillis()
            scheduleSave()
        }
    }

    private fun formatTime(time: Long): String {
        val diff = System.currentTimeMillis() - time
        val d = diff / 86_400_000L
        val h = diff % 86_400_000L / 3_600_000L
        val m = diff % 3_600_000L / 60_000L
        return when {
            d > 0 -> "${d}d"
            h > 0 -> "${h}h"
            m > 0 -> "${m}m"
            else -> "1m"
        }
    }

    private val fBinding: Field by lazy {
        WidgetChannelsListAdapter.ItemChannelPrivate::class.java.getDeclaredField("binding").apply { isAccessible = true }
    }

    override fun start(context: Context) {
        load()

        patcher.after<StoreUserPresence>(
            "handlePresenceUpdate",
            Long::class.javaPrimitiveType!!,
            Long::class.javaPrimitiveType!!,
            ClientStatus::class.java,
            ClientStatuses::class.java,
            List::class.java,
        ) { param ->
            try {
                onPresence(param.args[1] as Long, param.args[2] as ClientStatus?)
            } catch (e: Throwable) {
                logger.error("Failed to track a presence update", e)
            }
        }

        patcher.after<WidgetChannelsListAdapter.ItemChannelPrivate>("onConfigure", Int::class.javaPrimitiveType!!, ChannelListItem::class.java) { param ->
            try {
                val item = param.args[1] as? ChannelListItemPrivate ?: return@after
                val channel = item.channel
                if (channel.type != Members.TYPE_DM) return@after
                val userId = channel.recipientIds.firstOrNull() ?: return@after
                val time = lastOffline[userId] ?: return@after
                if (time == ONLINE || System.currentTimeMillis() - time > MAX_DISPLAY_AGE) return@after
                val desc = (fBinding[this] as WidgetChannelsListItemChannelPrivateBinding).d
                // Keep whatever Discord shows there (custom status, activity)
                if (desc.visibility == View.VISIBLE && !desc.text.isNullOrEmpty()) return@after
                ViewExtensions.setTextAndVisibilityBy(desc, I18n.t("{time} ago", "time" to formatTime(time)))
            } catch (e: Throwable) {
                logger.error("Failed to show the last online time", e)
            }
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        lastOffline.clear()
        dmUsers = emptySet()
        dmUsersAt = 0L
    }

    private companion object {
        const val ONLINE = -1L
        const val SAVED_KEY = "lastOffline"
        const val MAX_DISPLAY_AGE = 604_800_000L // 7 days
        const val SAVE_DELAY_MS = 30_000L
    }
}
