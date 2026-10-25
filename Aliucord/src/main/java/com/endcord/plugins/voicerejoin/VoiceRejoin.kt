/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.voicerejoin

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.after
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.discord.models.domain.ModelPayload
import com.discord.stores.StoreVoiceStates
import com.endcord.plugins.voicecommon.Voice
import com.endcord.plugins.voicecommon.VoiceChange
import com.endcord.plugins.voicecommon.VoiceEvents
import java.util.concurrent.atomic.AtomicBoolean

internal class VoiceRejoin : EndcordPlugin(
    name = "VoiceRejoin",
    description = "Rejoins DM/Server call automatically when restarting Discord.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("voice", "servers", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Number("rejoinDelay", "Set Delay before rejoining voice channel.", "In seconds", default = 2, min = 1, max = 10),
        PluginSetting.Number(
            "rejoinTimeout",
            "Don't attempt to rejoin after this many seconds have passed since disconnecting.",
            default = 30,
            min = 5,
            max = 120,
        ),
        PluginSetting.Choice(
            "preventReconnectIfCallEnded",
            "Do not reconnect if the call has ended or the voice channel is empty or does not exist.",
            options = listOf(
                PluginSetting.Choice.Option("none", "None"),
                PluginSetting.Choice.Option("dms", "DMs only"),
                PluginSetting.Choice.Option("servers", "Servers only"),
                PluginSetting.Choice.Option("both", "DMs and Servers"),
            ),
            default = "both",
        ),
        PluginSetting.Switch("applyOnlyToDms", "Only apply to DMs."),
    )

    /** Only the first connection after the app started counts as "restarting Discord". */
    private val handledStart = AtomicBoolean(false)

    @Volatile
    private var lastSave = 0L

    /**
     * Saves where this client is connected. Unlike PC, any change in your channel refreshes the time, so a long
     * call that ends with the app being killed still counts as "just disconnected".
     */
    private fun save(channelId: Long, force: Boolean) {
        val now = System.currentTimeMillis()
        if (!force && now - lastSave < SAVE_INTERVAL_MS) return
        lastSave = now
        Utils.threadPool.execute {
            try {
                // One value, so every save is a single write: "channelId:time", empty when not in voice
                settings.setString(SAVED_KEY, if (channelId == 0L) "" else "$channelId:$now")
            } catch (e: Throwable) {
                logger.error("Failed to save the last voice channel", e)
            }
        }
    }

    /** Keeps the saved time fresh during a quiet call, so being killed mid-call still rejoins. */
    private val heartbeat = object : Runnable {
        override fun run() {
            val mine = Voice.myChannelId()
            if (mine != 0L) save(mine, force = true)
            Utils.mainThread.postDelayed(this, HEARTBEAT_MS)
        }
    }

    private fun onVoiceChange(change: VoiceChange) {
        val mine = Voice.myChannelId()
        if (change.isMe) {
            val new = change.newChannelId
            when {
                new != null && new == mine -> save(new, force = change.channelChanged)
                new == null && mine == 0L && change.channelChanged -> save(0L, force = true)
            }
        } else if (mine != 0L && change.touches(mine)) {
            save(mine, force = false)
        }
    }

    /** Port of the CONNECTION_OPEN handler. */
    private fun onConnectionOpen() {
        if (!handledStart.compareAndSet(false, true)) return
        val saved = settings.getString(SAVED_KEY, "") ?: ""
        val channelId = saved.substringBefore(':').toLongOrNull() ?: return
        val savedAt = saved.substringAfter(':', "").toLongOrNull() ?: 0L

        Utils.mainThread.postDelayed({
            try {
                rejoin(channelId, savedAt)
            } catch (e: Throwable) {
                logger.error("Failed to run voice rejoin", e)
            }
        }, int("rejoinDelay").coerceIn(1, 10) * 1000L)
    }

    private fun rejoin(channelId: Long, savedAt: Long) {
        val channel = Voice.channel(channelId)
        if (channel == null) {
            save(0L, force = true)
            return
        }
        val isDm = channel.type == Voice.TYPE_DM || channel.type == Voice.TYPE_GROUP_DM
        val timeoutMs = int("rejoinTimeout").coerceIn(5, 120) * 1000L
        if (savedAt > 0 && System.currentTimeMillis() - savedAt > timeoutMs) {
            save(0L, force = true)
            return
        }
        if (bool("applyOnlyToDms") && !isDm) {
            save(0L, force = true)
            return
        }
        val mode = choice("preventReconnectIfCallEnded")
        val prevent = mode == "both" || (mode == "dms" && isDm) || (mode == "servers" && !isDm)
        if (prevent && Voice.statesIn(channelId).none { it.m() != Voice.myId() }) {
            save(0L, force = true)
            return
        }
        if (Voice.myChannelId() != 0L) return
        Voice.join(channelId) { result -> Voice.joinFailure(result)?.let { Utils.showToast(it) } }
    }

    override fun start(context: Context) {
        VoiceEvents.register(name, ::onVoiceChange)
        Utils.mainThread.postDelayed(heartbeat, HEARTBEAT_MS)
        patcher.after<StoreVoiceStates>("handleConnectionOpen", ModelPayload::class.java) {
            try {
                onConnectionOpen()
            } catch (e: Throwable) {
                logger.error("Failed to check for a voice rejoin", e)
            }
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        VoiceEvents.unregisterAll(name)
        Utils.mainThread.removeCallbacks(heartbeat)
    }

    private companion object {
        const val SAVED_KEY = "lastVoiceChannel"
        const val SAVE_INTERVAL_MS = 5_000L
        const val HEARTBEAT_MS = 15_000L
    }
}
