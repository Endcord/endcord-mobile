/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.focusmode

import android.content.Context
import com.aliucord.Utils
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.utils.RxUtils.await
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.discord.api.channel.Channel
import com.discord.api.presence.ClientStatus
import com.discord.restapi.RestAPIParams
import com.discord.stores.StoreStream
import com.discord.utilities.rest.RestAPI
import com.endcord.plugins.notifycommon.IdList
import com.endcord.plugins.notifycommon.Msg
import com.endcord.plugins.notifycommon.NotifyHooks
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.regex.Pattern
import com.discord.api.message.Message as ApiMessage

internal class FocusMode : EndcordPlugin(
    name = "FocusMode",
    description = "One switch for Do Not Disturb, quiet notifications and muted servers, on a schedule if you like, and back to your previous settings when it ends.",
    authors = arrayOf("rootpoi", "kraethis", "ewlle"),
) {
    override val tags = listOf("utility", "notifications")

    override val settingsSchema = listOf(
        PluginSetting.Action("toggle", "Turn Focus Mode on or off", "You can also use /focus in any chat") { toggle(true) },
        PluginSetting.Choice(
            "status",
            "Status",
            "Status while Focus Mode is on",
            listOf(
                PluginSetting.Choice.Option("dnd", "Do Not Disturb"),
                PluginSetting.Choice.Option("invisible", "Invisible"),
                PluginSetting.Choice.Option("idle", "Idle"),
                PluginSetting.Choice.Option("keep", "Keep my current status"),
            ),
        ),
        PluginSetting.Switch(
            "silenceNotifications",
            "Silence notifications",
            "Hide Discord's in-app notifications and, while the app runs, its notifications in the notification shade",
            true,
        ),
        PluginSetting.Switch("allowDirectMessages", "Allow direct messages", "Still notify me about direct messages"),
        PluginSetting.Text(
            "mutedServers",
            "Servers to mute",
            "IDs of the servers to mute while Focus Mode is on (comma separated). Servers you muted yourself are left alone.",
            multiline = true,
        ),
        PluginSetting.Switch("scheduleEnabled", "Schedule", "Turn on automatically at set times"),
        PluginSetting.Text("scheduleStart", "Start time", "Start time (24-hour, HH:MM)", default = "22:00", placeholder = "22:00"),
        PluginSetting.Text("scheduleEnd", "End time", "End time (24-hour, HH:MM)", default = "08:00", placeholder = "08:00"),
    )

    /** What Focus Mode changed, so turning it off puts things back. Saved across restarts. */
    private class State(
        var active: Boolean = false,
        var bySchedule: Boolean = false,
        var previousStatus: String? = null,
        var appliedStatus: String? = null,
        var mutedByUs: List<Long> = emptyList(),
        var skipUntil: Long = 0L,
    )

    private var state = State()
    private val mutedServers by lazy { IdList(settings, "mutedServers") }
    private val tick = Runnable { reschedule() }

    override fun start(context: Context) {
        state = loadState()
        NotifyHooks.popups(name, listener = object : NotifyHooks.PopupListener {
            override fun allowPopup(message: ApiMessage, channel: Channel): Boolean = !silences(channel.guildId)
        })
        NotifyHooks.pushes(name) { data -> !silences(data.guildId) }
        commands.registerCommand("focus", "Turn Focus Mode on or off") {
            val on = toggle(false)
            CommandResult(I18n.t(if (on) "Focus Mode is on" else "Focus Mode is off. Your previous settings are back."), null, false)
        }
        reschedule()
    }

    override fun stop(context: Context) {
        Utils.mainThread.removeCallbacks(tick)
        NotifyHooks.unregisterAll(name)
        // Disabling the plugin ends Focus Mode properly instead of leaving servers muted
        if (state.active) turnOff(manual = false)
        super.stop(context)
    }

    override fun onSettingChanged(key: String) {
        if (key.startsWith("schedule")) reschedule()
    }

    /** Whether a notification from [guildId] (0 for DMs) is swallowed right now. */
    private fun silences(guildId: Long): Boolean {
        if (!state.active || !bool("silenceNotifications")) return false
        return !(guildId == 0L && bool("allowDirectMessages"))
    }

    // ---- turning it on and off ----

    /** Flips Focus Mode, returns whether it is on afterwards. */
    private fun toggle(toast: Boolean): Boolean {
        if (state.active) turnOff(manual = true) else turnOn(bySchedule = false)
        if (toast) {
            Utils.showToast(I18n.t(if (state.active) "Focus Mode is on" else "Focus Mode is off. Your previous settings are back."))
        }
        return state.active
    }

    private fun turnOn(bySchedule: Boolean) {
        if (state.active) return
        val target = choice("status")
        val current = Msg.myStatus()
        val next = State(active = true, bySchedule = bySchedule)
        if (target != "keep" && current != null && current.name.lowercase() != target) {
            next.previousStatus = current.name.lowercase()
            next.appliedStatus = target
            setStatus(target)
        }
        next.mutedByUs = muteServers()
        state = next
        saveState()
    }

    private fun turnOff(manual: Boolean) {
        if (!state.active) return
        val old = state
        val applied = old.appliedStatus
        val previous = old.previousStatus
        if (applied != null && previous != null) {
            if (Msg.myStatus()?.name?.lowercase() == applied) setStatus(previous)
            else if (manual) Utils.showToast(I18n.t("You changed your status during Focus Mode, so it was kept."))
        }
        unmuteServers(old.mutedByUs)
        // Turned off by hand during the scheduled time: stay off until that time is over
        val window = currentWindow()
        state = State(skipUntil = if (manual && window != null) window.end else 0L)
        saveState()
    }

    private fun setStatus(value: String) {
        val status = when (value) {
            "dnd" -> ClientStatus.DND
            "invisible" -> ClientStatus.INVISIBLE
            "idle" -> ClientStatus.IDLE
            else -> ClientStatus.ONLINE
        }
        Utils.threadPool.execute {
            val (_, error) = RestAPI.getApi().updateUserSettings(RestAPIParams.UserSettings.createWithStatus(status)).await()
            if (error != null) {
                logger.error("Failed to change the status", error)
                Utils.mainThread.post { Utils.showToast(I18n.t("Discord did not accept the status change. The other filters are on.")) }
            }
        }
    }

    private fun muteServers(): List<Long> {
        val muted = ArrayList<Long>()
        val guildSettings = StoreStream.getUserGuildSettings()
        for (guildId in mutedServers.ids()) {
            if (StoreStream.getGuilds().getGuild(guildId) == null || guildSettings.guildSettings[guildId]?.isMuted == true) continue
            try {
                guildSettings.setGuildMuted(Utils.appContext, guildId, true, null)
                muted += guildId
            } catch (e: Throwable) {
                logger.error("Failed to mute server $guildId", e)
            }
        }
        return muted
    }

    private fun unmuteServers(ids: List<Long>) {
        val guildSettings = StoreStream.getUserGuildSettings()
        for (guildId in ids) {
            if (guildSettings.guildSettings[guildId]?.isMuted != true) continue
            try {
                guildSettings.setGuildMuted(Utils.appContext, guildId, false, null)
            } catch (e: Throwable) {
                logger.error("Failed to unmute server $guildId", e)
            }
        }
    }

    // ---- schedule ----

    private val time = Pattern.compile("^(\\d{1,2}):(\\d{2})$")

    private fun minutesOf(value: String): Int? {
        val matcher = time.matcher(value.trim())
        if (!matcher.matches()) return null
        val hours = matcher.group(1)!!.toInt()
        val minutes = matcher.group(2)!!.toInt()
        return if (hours < 24 && minutes < 60) hours * 60 + minutes else null
    }

    private class Window(val start: Long, val end: Long)

    /** The scheduled window containing now, or null. */
    private fun currentWindow(): Window? {
        if (!bool("scheduleEnabled")) return null
        val start = minutesOf(string("scheduleStart")) ?: return null
        val end = minutesOf(string("scheduleEnd")) ?: return null
        if (start == end) return null
        val now = Calendar.getInstance()
        val minutes = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
        fun at(dayOffset: Int, m: Int): Long = (now.clone() as Calendar).apply {
            add(Calendar.DAY_OF_YEAR, dayOffset)
            set(Calendar.HOUR_OF_DAY, m / 60)
            set(Calendar.MINUTE, m % 60)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        return when {
            start < end -> if (minutes >= start && minutes < end) Window(at(0, start), at(0, end)) else null
            // Overnight, like 22:00 to 08:00
            minutes >= start -> Window(at(0, start), at(1, end))
            minutes < end -> Window(at(-1, start), at(0, end))
            else -> null
        }
    }

    private fun reschedule() {
        Utils.mainThread.removeCallbacks(tick)
        try {
            val window = currentWindow()
            val now = System.currentTimeMillis()
            if (window != null && !state.active && state.skipUntil <= now) turnOn(bySchedule = true)
            else if (window == null && state.active && state.bySchedule) turnOff(manual = false)
        } catch (e: Throwable) {
            logger.error("Failed to apply the schedule", e)
        }
        if (!bool("scheduleEnabled")) return
        // Check again at the next minute; cheap, and robust against sleep and clock changes
        val now = System.currentTimeMillis()
        Utils.mainThread.postDelayed(tick, 60_000L - now % 60_000L + 500L)
    }

    // ---- persistence ----

    private fun saveState() {
        val s = state
        val json = JSONObject()
            .put("active", s.active)
            .put("bySchedule", s.bySchedule)
            .put("previousStatus", s.previousStatus ?: "")
            .put("appliedStatus", s.appliedStatus ?: "")
            .put("mutedByUs", JSONArray().apply { s.mutedByUs.forEach { put(it.toString()) } })
            .put("skipUntil", s.skipUntil)
            .toString()
        Utils.threadPool.execute { settings.setString("state", json) }
    }

    private fun loadState(): State = try {
        val json = JSONObject(settings.getString("state", null) ?: "{}")
        val muted = json.optJSONArray("mutedByUs")
        State(
            active = json.optBoolean("active"),
            bySchedule = json.optBoolean("bySchedule"),
            previousStatus = json.optString("previousStatus").ifEmpty { null },
            appliedStatus = json.optString("appliedStatus").ifEmpty { null },
            mutedByUs = ArrayList<Long>().apply {
                if (muted != null) for (i in 0 until muted.length()) muted.optString(i).toLongOrNull()?.let { add(it) }
            },
            skipUntil = json.optLong("skipUntil"),
        )
    } catch (_: Throwable) {
        State()
    }
}
