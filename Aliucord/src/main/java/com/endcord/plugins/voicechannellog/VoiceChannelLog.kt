/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.voicechannellog

import android.content.Context
import android.text.format.DateFormat
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.endcord.plugins.commandscommon.Dialogs
import com.endcord.plugins.voicecommon.CallSettingsEntries
import com.endcord.plugins.voicecommon.Voice
import com.endcord.plugins.voicecommon.VoiceChange
import com.endcord.plugins.voicecommon.VoiceEvents
import java.util.Date

internal class VoiceChannelLog : EndcordPlugin(
    name = "VoiceChannelLog",
    description = "Logs voice channel activity including joins, leaves, mute, camera, screenshare, and more.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("voice", "servers", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch("logJoinLeave", "Log when users join, leave, or move between voice channels.", default = true),
        PluginSetting.Switch("logMuteDeafen", "Log when users are server muted or deafened.", default = true),
        PluginSetting.Switch("logVideo", "Log when users turn their camera on or off.", default = true),
        PluginSetting.Switch("logStream", "Log when users start or stop screensharing.", default = true),
        PluginSetting.Switch("ignoreBlockedUsers", "Do not log blocked users."),
        PluginSetting.Action("clear", "Clear logs") {
            synchronized(entries) { entries.clear() }
            Utils.showToast(I18n.t("Logs cleared"))
        },
    )

    private class Entry(val time: Long, val channelId: Long, val text: String)

    /** Newest last, at most [MAX_ENTRIES], in memory only like PC. */
    private val entries = ArrayList<Entry>()

    /** Joins reported right after you join are the people already there, not news (PC: 5 seconds). */
    @Volatile
    private var joinedAt = 0L

    private fun log(channelId: Long, text: String) {
        synchronized(entries) {
            entries += Entry(System.currentTimeMillis(), channelId, text)
            if (entries.size > MAX_ENTRIES) entries.subList(0, entries.size - MAX_ENTRIES).clear()
        }
    }

    private fun userName(userId: Long, channelId: Long): String = Voice.displayName(userId, Voice.channel(channelId)?.guildId ?: 0L)

    /** Port of the VOICE_CHANNEL_SELECT and VOICE_STATE_UPDATES handlers. Store thread. */
    private fun onVoiceChange(change: VoiceChange) {
        val mine = Voice.myChannelId()
        val old = change.oldChannelId
        val new = change.newChannelId
        val userId = change.userId

        if (change.isMe) {
            if (!change.channelChanged || !bool("logJoinLeave")) {
                if (change.channelChanged) joinedAt = System.currentTimeMillis()
                return
            }
            // This client's own state: true even before the selected channel catches up with a moderator's move
            if (new != null) {
                joinedAt = System.currentTimeMillis()
                log(new, I18n.t("You joined"))
            } else if (old != null) {
                log(old, I18n.t("You left"))
            }
            return
        }
        if (mine == 0L || !change.touches(mine)) return
        if (bool("ignoreBlockedUsers") && Voice.isBlocked(userId)) return
        val user = userName(userId, mine)

        if (change.channelChanged) {
            if (!bool("logJoinLeave")) return
            when {
                old == null && new == mine -> {
                    if (System.currentTimeMillis() - joinedAt >= JOIN_GRACE_MS) log(mine, I18n.t("{user} joined", "user" to user))
                }
                new == null && old == mine -> log(mine, I18n.t("{user} left", "user" to user))
                old == mine && new != null ->
                    log(mine, I18n.t("{user} moved to {channel}", "user" to user, "channel" to Voice.channelName(new)))
                new == mine && old != null ->
                    log(mine, I18n.t("{user} moved in from {channel}", "user" to user, "channel" to Voice.channelName(old)))
            }
            return
        }

        val state = change.new ?: return
        if (bool("logMuteDeafen")) {
            if (change.serverMuteChanged) {
                log(mine, if (state.e()) I18n.t("{user} was server muted", "user" to user) else I18n.t("{user} was server unmuted", "user" to user))
            }
            if (change.serverDeafChanged) {
                log(mine, if (state.b()) I18n.t("{user} was server deafened", "user" to user) else I18n.t("{user} was server undeafened", "user" to user))
            }
        }
        if (bool("logVideo") && change.videoChanged) {
            log(mine, if (state.j()) I18n.t("{user} turned their camera on", "user" to user) else I18n.t("{user} turned their camera off", "user" to user))
        }
        if (bool("logStream") && change.streamChanged) {
            log(mine, if (state.i()) I18n.t("{user} started screensharing", "user" to user) else I18n.t("{user} stopped screensharing", "user" to user))
        }
    }

    private fun show(channelId: Long) {
        val activity = Voice.activity() ?: return
        val lines = synchronized(entries) { entries.filter { it.channelId == channelId } }
        val format = DateFormat.getTimeFormat(activity)
        val text = if (lines.isEmpty()) I18n.t("Nothing logged in this channel yet") else {
            lines.asReversed().joinToString("\n") { "[${format.format(Date(it.time))}] ${it.text}" }
        }
        Dialogs.showText(activity, I18n.t("Voice Channel Logs") + " • " + Voice.channelName(channelId), text)
    }

    override fun start(context: Context) {
        VoiceEvents.register(name, ::onVoiceChange)
        CallSettingsEntries.registerButton(name, "View Voice Channel Logs") { channel, sheet ->
            try {
                sheet.dismiss()
            } catch (_: Throwable) {
            }
            show(channel.id)
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        VoiceEvents.unregisterAll(name)
        CallSettingsEntries.unregisterAll(name)
        synchronized(entries) { entries.clear() }
    }

    private companion object {
        const val MAX_ENTRIES = 500
        const val JOIN_GRACE_MS = 5_000L
    }
}
