/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.vcnarrator

import android.content.Context
import android.os.Bundle
import android.speech.tts.TextToSpeech
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.endcord.plugins.voicecommon.Voice
import com.endcord.plugins.voicecommon.VoiceChange
import com.endcord.plugins.voicecommon.VoiceEvents
import java.text.Normalizer
import java.util.Locale
import java.util.regex.Pattern

internal class VcNarrator : EndcordPlugin(
    name = "VcNarrator",
    description = "Announces when users join, leave, or move voice channels via narrator",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("voice", "accessibility")

    override val settingsSchema = listOf(
        PluginSetting.Number("volume", "Narrator Volume", "In percent", default = 100, min = 0, max = 100),
        PluginSetting.Number("rate", "Narrator Speed", "In percent, 100 is normal speed", default = 100, min = 10, max = 500),
        PluginSetting.Switch("sayOwnName", "Say own name"),
        PluginSetting.Switch("latinOnly", "Strip non latin characters from names before saying them"),
        PluginSetting.Text("joinMessage", "Join Message", PLACEHOLDER_HELP, default = DEFAULT_JOIN),
        PluginSetting.Text("leaveMessage", "Leave Message", PLACEHOLDER_HELP, default = DEFAULT_LEAVE),
        PluginSetting.Text("moveMessage", "Move Message", PLACEHOLDER_HELP, default = DEFAULT_MOVE),
        PluginSetting.Text("muteMessage", "Mute Message (only self for now)", PLACEHOLDER_HELP, default = DEFAULT_MUTE),
        PluginSetting.Text("unmuteMessage", "Unmute Message (only self for now)", PLACEHOLDER_HELP, default = DEFAULT_UNMUTE),
        PluginSetting.Text("deafenMessage", "Deafen Message (only self for now)", PLACEHOLDER_HELP, default = DEFAULT_DEAFEN),
        PluginSetting.Text("undeafenMessage", "Undeafen Message (only self for now)", PLACEHOLDER_HELP, default = DEFAULT_UNDEAFEN),
        PluginSetting.Action("example", "Play Example Sounds") { playSample() },
    )

    private var tts: TextToSpeech? = null

    @Volatile
    private var ready = false

    private fun createTts(context: Context) {
        ready = false
        tts = TextToSpeech(context.applicationContext) { status ->
            if (status != TextToSpeech.SUCCESS) {
                logger.warn("Text to speech is not available on this device")
                Utils.showToast(I18n.t("No narrator voices found. Install a text to speech engine in your phone's settings"))
                return@TextToSpeech
            }
            val engine = tts ?: return@TextToSpeech
            try {
                // Speak in the user's Endcord language when the engine has it, else the phone's
                val wanted = Locale(I18n.language.code)
                val result = engine.setLanguage(wanted)
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    logger.warn("No narrator voice for ${wanted.language}, using the phone's default")
                    engine.setLanguage(Locale.getDefault())
                }
                ready = true
            } catch (e: Throwable) {
                logger.error("Failed to set up the narrator", e)
            }
        }
    }

    /** The template for [type], translated while it is still Endcord's default text. */
    private fun template(type: String): String {
        val key = type + "Message"
        val value = string(key)
        val default = (settingsSchema.first { it.key == key } as PluginSetting.Text).default
        return if (value == default) I18n.t(default) else value
    }

    private val latinOnlyPattern = Pattern.compile("[^\\p{IsLatin}\\p{N}\\p{P}\\s]")
    private val anyLetterPattern = Pattern.compile("[^\\p{L}\\p{N}\\p{P}\\s]")
    private val underscores = Pattern.compile("_{2,}")

    private fun clean(str: String): String {
        val pattern = if (bool("latinOnly")) latinOnlyPattern else anyLetterPattern
        val normalized = Normalizer.normalize(str, Normalizer.Form.NFKC)
        return underscores.matcher(pattern.matcher(normalized).replaceAll("")).replaceAll("_").trim()
    }

    private fun formatText(template: String, user: String, channel: String, displayName: String, nickname: String): String {
        val someone = I18n.t("Someone")
        return template
            .replace("{{USER}}", clean(user).ifEmpty { if (user.isNotEmpty()) someone else "" })
            .replace("{{CHANNEL}}", clean(channel).ifEmpty { I18n.t("channel") })
            .replace("{{DISPLAY_NAME}}", clean(displayName).ifEmpty { if (displayName.isNotEmpty()) someone else "" })
            .replace("{{NICKNAME}}", clean(nickname).ifEmpty { if (nickname.isNotEmpty()) someone else "" })
            .trim()
    }

    private fun speak(text: String) {
        if (text.isBlank()) return
        Utils.mainThread.post {
            val engine = tts
            if (engine == null || !ready) return@post
            try {
                engine.setSpeechRate(int("rate").coerceIn(10, 500) / 100f)
                val params = Bundle().apply {
                    putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, int("volume").coerceIn(0, 100) / 100f)
                }
                engine.speak(text, TextToSpeech.QUEUE_ADD, params, "vcnarrator-${System.nanoTime()}")
            } catch (e: Throwable) {
                logger.error("Failed to speak", e)
            }
        }
    }

    private fun announce(type: String, userId: Long, channelId: Long, isMe: Boolean) {
        val template = template(type)
        if (template.isBlank()) return
        val guildId = Voice.channel(channelId)?.guildId ?: 0L
        val user = if (isMe && !bool("sayOwnName")) "" else Voice.username(userId)
        val displayName = if (user.isEmpty()) "" else Voice.displayName(userId, 0L)
        val nickname = if (user.isEmpty()) "" else Voice.displayName(userId, guildId)
        speak(formatText(template, user, Voice.channelName(channelId), displayName, nickname))
    }

    /** Port of the VOICE_STATE_UPDATES handler plus the self mute/deafen events. Store thread. */
    private fun onVoiceChange(change: VoiceChange) {
        val myChannel = Voice.myChannelId()
        if (myChannel != 0L && Voice.channel(myChannel)?.type == Voice.TYPE_STAGE) return
        val isMe = change.isMe
        val old = change.oldChannelId
        val new = change.newChannelId

        if (isMe) {
            // Ignore your other devices: only what this client joins or leaves
            if (new != null && new != myChannel) return
            if (change.channelChanged) {
                when {
                    new != null -> announce(if (old != null) "move" else "join", change.userId, new, true)
                    old != null && myChannel == 0L -> announce("leave", change.userId, old, true)
                }
                return
            }
            val channel = new ?: return
            val state = change.new ?: return
            if (change.selfDeafChanged) {
                announce(if (state.g()) "deafen" else "undeafen", change.userId, channel, true)
            } else if (change.selfMuteChanged) {
                announce(if (state.h()) "mute" else "unmute", change.userId, channel, true)
            }
            return
        }

        if (myChannel == 0L || !change.touches(myChannel) || !change.channelChanged) return
        when {
            new != null -> announce(if (old != null) "move" else "join", change.userId, new, false)
            old != null -> announce("leave", change.userId, old, false)
        }
    }

    private fun playSample() {
        val me = Voice.myId()
        val user = Voice.username(me)
        speak(formatText(template("join"), user, I18n.t("general"), Voice.displayName(me, 0L), user))
    }

    override fun start(context: Context) {
        createTts(context)
        VoiceEvents.register(name, ::onVoiceChange)
    }

    override fun stop(context: Context) {
        super.stop(context)
        VoiceEvents.unregisterAll(name)
        ready = false
        try {
            tts?.stop()
            tts?.shutdown()
        } catch (e: Throwable) {
            logger.error("Failed to shut down the narrator", e)
        }
        tts = null
    }

    private companion object {
        const val PLACEHOLDER_HELP =
            "{{USER}}, {{DISPLAY_NAME}}, {{NICKNAME}} and {{CHANNEL}} are replaced with the user's name (nothing if it's yourself), display name, server nickname and the channel's name. Leave empty to say nothing"
        const val DEFAULT_JOIN = "{{USER}} joined"
        const val DEFAULT_LEAVE = "{{USER}} left"
        const val DEFAULT_MOVE = "{{USER}} moved to {{CHANNEL}}"
        const val DEFAULT_MUTE = "{{USER}} muted"
        const val DEFAULT_UNMUTE = "{{USER}} unmuted"
        const val DEFAULT_DEAFEN = "{{USER}} deafened"
        const val DEFAULT_UNDEAFEN = "{{USER}} undeafened"
    }
}
