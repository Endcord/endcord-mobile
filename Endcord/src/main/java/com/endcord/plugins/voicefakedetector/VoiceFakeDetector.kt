/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.voicefakedetector

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.utils.RxUtils.subscribe
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.discord.stores.StoreRtcConnection
import com.discord.stores.StoreStream
import com.endcord.plugins.voicecommon.Voice
import com.endcord.plugins.voicecommon.VoiceEvents
import rx.Subscription
import java.util.concurrent.ConcurrentHashMap

internal class VoiceFakeDetector : EndcordPlugin(
    name = "VoiceFakeDetector",
    description = "Tells you when someone in your voice channel fakes their voice state with any client mod: shown as muted or deafened but still talking. Resets when they leave or genuinely unmute.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("voice", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch("notify", "Show a notification when someone is caught", default = true),
    )

    /** User id -> what they were caught faking ("mute", "deaf", "both"). */
    private val caught = ConcurrentHashMap<Long, String>()

    /** When each user's mute or deafen last changed: the last audio packets can arrive right after a real mute. */
    private val lastChange = ConcurrentHashMap<Long, Long>()

    private var subscription: Subscription? = null

    private fun label(kind: String): String = when (kind) {
        "both" -> I18n.t("faking mute & deafen")
        "deaf" -> I18n.t("faking deafen")
        else -> I18n.t("faking mute")
    }

    /** Port of onSpeaking. */
    private fun onSpeaking(userId: Long) {
        if (userId == Voice.myId()) return
        val mine = Voice.myChannelId()
        if (mine == 0L) return
        if (System.currentTimeMillis() - (lastChange[userId] ?: 0L) < GRACE_MS) return
        // Server mute and suppression are enforced by Discord itself, so only self states can be faked
        val state = Voice.statesIn(mine).firstOrNull { it.m() == userId } ?: return
        if (state.e() || state.l()) return
        val mute = state.h()
        val deaf = state.g()
        if (!mute && !deaf) return
        val kind = if (mute && deaf) "both" else if (deaf) "deaf" else "mute"
        val previous = caught.put(userId, kind)
        if (previous == null && bool("notify")) {
            val guildId = Voice.channel(mine)?.guildId ?: 0L
            val name = Voice.displayName(userId, guildId)
            Utils.showToast(I18n.t("{user} is {state} but still talking.", "user" to name, "state" to label(kind)), true)
        }
    }

    override fun start(context: Context) {
        VoiceEvents.register(name) { change ->
            val userId = change.userId
            if (change.channelChanged) {
                // Leaving (or you leaving) clears the mark, like PC
                if (change.isMe) caught.clear() else caught.remove(userId)
                lastChange.remove(userId)
                return@register
            }
            if (change.selfMuteChanged || change.selfDeafChanged) {
                lastChange[userId] = System.currentTimeMillis()
                val state = change.new
                if (state != null && !state.h() && !state.g()) caught.remove(userId)
            }
        }
        subscription = StoreStream.getRtcConnection().speakingUpdates.subscribe {
            try {
                for (update: StoreRtcConnection.SpeakingUserUpdate in this) {
                    if (update.isSpeaking) onSpeaking(update.userId)
                }
            } catch (e: Throwable) {
                logger.error("Failed to check speaking users", e)
            }
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        VoiceEvents.unregisterAll(name)
        subscription?.unsubscribe()
        subscription = null
        caught.clear()
        lastChange.clear()
    }

    private companion object {
        const val GRACE_MS = 1500L
    }
}
