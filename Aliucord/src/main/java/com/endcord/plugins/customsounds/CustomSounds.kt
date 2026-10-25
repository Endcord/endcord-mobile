/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.customsounds

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.patcher.before
import com.discord.utilities.media.AppSound
import com.discord.utilities.media.AppSoundManager
import com.endcord.plugins.notifycommon.Sounds
import java.io.File
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

internal class CustomSounds : EndcordPlugin(
    name = "CustomSounds",
    description = "Customize Discord's sounds.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("customisation", "voice")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            "sounds",
            "Sounds",
            "One sound per line as name = replacement. The replacement is a link to an audio file, a seasonal " +
                "variant (halloween, winter; beat, snow_halation or snowsgiving for call_ringing), or none to mute it. " +
                "Names: " + NAMES.joinToString(", "),
            placeholder = "user_join = winter\ncall_ringing = https://example.com/ring.mp3\nmute = none",
            multiline = true,
        ),
        PluginSetting.Number("volume", "Volume", "Volume of the replaced sounds, in percent", 100, 0, 100),
    )

    /** Discord's sounds by resource id, named like Endcord PC names them. */
    private val names: Map<Int, String> by lazy {
        val out = HashMap<Int, String>()
        // AppSound's companion is unreachable from Kotlin (its metadata is stripped), read its getters directly
        val companion = try {
            AppSound::class.java.getField("Companion").get(null)
        } catch (e: Throwable) {
            logger.error("Failed to find Discord's sounds", e)
            null
        } ?: return@lazy out
        for (method in companion.javaClass.declaredMethods) {
            val methodName: String = method.name
            if (!methodName.startsWith("getSOUND_") || method.parameterTypes.isNotEmpty()) continue
            try {
                val sound = method.invoke(companion) as? AppSound ?: continue
                val name = when (val raw = methodName.removePrefix("getSOUND_").lowercase(Locale.ROOT)) {
                    "user_joined" -> "user_join"
                    "user_left" -> "user_leave"
                    else -> raw
                }
                out[sound.resId] = name
            } catch (e: Throwable) {
                logger.error("Failed to read $methodName", e)
            }
        }
        out
    }

    private val players = ConcurrentHashMap<String, MediaPlayer>()
    private val files = ConcurrentHashMap<String, File>()

    override fun start(context: Context) {
        preloadAll()

        patcher.before<AppSoundManager>("play", AppSound::class.java) { param ->
            val sound = param.args[0] as? AppSound ?: return@before
            val name = names[sound.resId] ?: return@before
            val source = sourceFor(name) ?: return@before
            if (source == SILENT) {
                param.result = null
                return@before
            }
            // Until the replacement is downloaded, Discord's own sound plays
            val file = files[source] ?: return@before
            try {
                playOwn(name, file, sound)
                param.result = null
            } catch (e: Throwable) {
                logger.error("Failed to play the custom $name sound", e)
            }
        }
        patcher.before<AppSoundManager>("stop", AppSound::class.java) { param ->
            val sound = param.args[0] as? AppSound ?: return@before
            names[sound.resId]?.let { stopOwn(it) }
        }
        patcher.after<AppSoundManager>("isPlaying", AppSound::class.java) { param ->
            val sound = param.args[0] as? AppSound ?: return@after
            val name = names[sound.resId] ?: return@after
            if (players[name]?.let { isPlaying(it) } == true) param.result = true
        }
    }

    override fun onSettingChanged(key: String) {
        if (key == "sounds") preloadAll()
    }

    override fun stop(context: Context) {
        super.stop(context)
        for (name in players.keys.toList()) stopOwn(name)
    }

    /** What [name] is replaced with: a URL, [SILENT], or null to keep Discord's sound. */
    private fun sourceFor(name: String): String? {
        for (line in string("sounds").split('\n')) {
            val separator = line.indexOf('=')
            if (separator <= 0) continue
            if (line.substring(0, separator).trim().lowercase(Locale.ROOT) != name) continue
            val value = line.substring(separator + 1).trim()
            val lower = value.lowercase(Locale.ROOT)
            return when {
                lower == "none" || lower == "off" || lower == "mute" -> SILENT
                lower.startsWith("https://") || lower.startsWith("http://") -> value
                else -> SEASONAL["${lower}_$name"] ?: SEASONAL["${name}_$lower"]
            }
        }
        return null
    }

    private fun preloadAll() {
        val sources = NAMES.mapNotNull { sourceFor(it) }.filter { it != SILENT && !files.containsKey(it) }
        if (sources.isEmpty()) return
        Utils.threadPool.execute {
            var failed = false
            for (source in sources) {
                val file = Sounds.cachedFile(source)
                if (file != null) files[source] = file else failed = true
            }
            if (failed) Utils.mainThread.post { Utils.showToast(I18n.t("Some custom sounds couldn't be downloaded")) }
        }
    }

    private fun playOwn(name: String, file: File, sound: AppSound) {
        stopOwn(name)
        val volume = int("volume").coerceIn(0, 100) / 100f
        val player = MediaPlayer()
        player.setAudioAttributes(AudioAttributes.Builder().setUsage(sound.usage).setContentType(sound.contentType).build())
        player.setDataSource(file.absolutePath)
        player.isLooping = sound.shouldLoop
        player.setVolume(volume, volume)
        player.setOnCompletionListener {
            if (players.remove(name, it)) it.release()
        }
        player.prepare()
        players[name] = player
        player.start()
    }

    private fun stopOwn(name: String) {
        val player = players.remove(name) ?: return
        try {
            player.stop()
        } catch (_: Throwable) {
        }
        player.release()
    }

    private fun isPlaying(player: MediaPlayer) = try {
        player.isPlaying
    } catch (_: Throwable) {
        false
    }

    private companion object {
        const val SILENT = "none"

        val NAMES = listOf(
            "call_calling", "call_ringing", "deafen", "undeafen", "mute", "unmute", "user_join", "user_leave",
            "user_moved", "reconnect", "stream_started", "stream_ended", "stream_user_joined", "stream_user_left",
        )

        /** Discord's seasonal sounds, the same ones Endcord PC offers. */
        val SEASONAL = mapOf(
            "halloween_call_calling" to "https://canary.discord.com/assets/0950a7ea4f1dd037870b.mp3",
            "winter_call_calling" to "https://canary.discord.com/assets/7b945e7be3f86c5b7c82.mp3",
            "halloween_call_ringing" to "https://canary.discord.com/assets/1b883b366ae11a303b82.mp3",
            "winter_call_ringing" to "https://canary.discord.com/assets/e087eb83aaa4c43a44bc.mp3",
            "call_ringing_beat" to "https://canary.discord.com/assets/3b3a2f5f29b9cb656efb.mp3",
            "call_ringing_snow_halation" to "https://canary.discord.com/assets/99b1d8a6fe0b95e99827.mp3",
            "call_ringing_snowsgiving" to "https://canary.discord.com/assets/54527e70cf0ddaeff76f.mp3",
            "halloween_deafen" to "https://canary.discord.com/assets/c4aedda3b528df50221c.mp3",
            "winter_deafen" to "https://canary.discord.com/assets/9bb77985afdb60704817.mp3",
            "halloween_mute" to "https://canary.discord.com/assets/ee7fdadf4c714eed6254.mp3",
            "winter_mute" to "https://canary.discord.com/assets/6d7616e08466ab9f1c6d.mp3",
            "halloween_undeafen" to "https://canary.discord.com/assets/045e5b9608df1607e0cf.mp3",
            "winter_undeafen" to "https://canary.discord.com/assets/fa8da1499894ecac36c7.mp3",
            "halloween_unmute" to "https://canary.discord.com/assets/260c581568eacca03f7e.mp3",
            "winter_unmute" to "https://canary.discord.com/assets/9dbfb1c211e3815cd7b1.mp3",
            "halloween_user_join" to "https://canary.discord.com/assets/80cf806f45467a5898cd.mp3",
            "winter_user_join" to "https://canary.discord.com/assets/badc42c2a9063b4a962c.mp3",
            "halloween_user_leave" to "https://canary.discord.com/assets/f407ad88a1dc40541769.mp3",
            "winter_user_leave" to "https://canary.discord.com/assets/ec3d9eaea30b33e16da6.mp3",
        )
    }
}
