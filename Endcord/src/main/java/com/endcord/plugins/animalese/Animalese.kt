/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.animalese

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.endcord.plugins.notifycommon.Msg
import com.endcord.plugins.notifycommon.NotifyHooks
import com.endcord.plugins.notifycommon.Sounds
import java.util.Locale
import java.util.Random
import java.util.concurrent.Executors
import java.util.regex.Pattern

internal class Animalese : EndcordPlugin(
    name = "Animalese",
    description = "Plays animal crossing animalese for every message sent (they yap a lot)",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("customisation", "fun")

    override val settingsSchema = listOf(
        PluginSetting.Number("volume", "Volume", "Volume of the animalese sound, in percent", 50, 0, 100),
        PluginSetting.Choice(
            "speed",
            "Speed",
            "Speed of the animalese sound",
            listOf("0.5", "0.75", "1", "1.25", "1.5").map { PluginSetting.Choice.Option(it, it + "×") },
            default = "1",
        ),
        PluginSetting.Choice(
            "pitch",
            "Pitch",
            "Pitch multiplier",
            listOf("0.75", "0.8", "0.85", "1", "1.15", "1.25", "1.35", "1.5").map { PluginSetting.Choice.Option(it, it + "×") },
            default = "1",
        ),
        PluginSetting.Number("messageLengthLimit", "Length limit", "Maximum length of message to process", 50, 1, 2000),
        PluginSetting.Switch("processOwnMessages", "Own messages", "Enable to yap your own messages too", true),
        PluginSetting.Choice(
            "soundQuality",
            "Quality",
            "Quality of sound to use",
            listOf(
                PluginSetting.Choice.Option("high", "High"),
                PluginSetting.Choice.Option("med", "Medium"),
                PluginSetting.Choice.Option("low", "Low"),
            ),
        ),
    )

    /** A decoded letter sound: mono samples between -1 and 1. */
    private class Clip(val samples: FloatArray, val sampleRate: Int)

    private val worker = Executors.newSingleThreadExecutor()
    private val random = Random()
    @Volatile private var clips: Map<String, Clip> = emptyMap()
    @Volatile private var loadedQuality: String? = null
    private var track: AudioTrack? = null

    override fun start(context: Context) {
        NotifyHooks.trackAppState(name)
        loadClips()
        NotifyHooks.messages(name) { message ->
            val content = message.i()
            if (content.isNullOrEmpty() || !Msg.isFresh(message) || Msg.isBot(message)) return@messages
            if (!Msg.isViewing(message.g())) return@messages
            if (url.matcher(content).find() || content.length > int("messageLengthLimit").coerceAtLeast(1)) return@messages
            if (!bool("processOwnMessages") && Msg.isOwn(message)) return@messages
            worker.execute { speak(content) }
        }
    }

    override fun onSettingChanged(key: String) {
        if (key == "soundQuality") loadClips()
    }

    override fun stop(context: Context) {
        NotifyHooks.unregisterAll(name)
        worker.execute {
            releaseTrack()
            clips = emptyMap()
            loadedQuality = null
        }
        super.stop(context)
    }

    private fun loadClips() {
        val quality = choice("soundQuality").ifEmpty { "high" }
        worker.execute {
            if (loadedQuality == quality) return@execute
            val out = HashMap<String, Clip>()
            for (i in 1..30) {
                val id = "sound" + (if (i < 10) "0$i" else "$i")
                val file = Sounds.cachedFile("$BASE_URL/$quality/$id.wav") ?: continue
                try {
                    decodeWav(file.readBytes())?.let { out[id] = it }
                } catch (e: Throwable) {
                    logger.error("Failed to decode $id", e)
                }
            }
            if (out.isNotEmpty()) {
                clips = out
                loadedQuality = quality
            }
        }
    }

    private fun speak(text: String) {
        if (NotifyHooks.isBackgrounded || !Sounds.ringerAllowsSound()) return
        val clips = clips
        if (clips.isEmpty()) return
        val sampleRate = clips.values.first().sampleRate
        val speed = choice("speed").toFloatOrNull()?.coerceIn(0.25f, 4f) ?: 1f
        val pitch = choice("pitch").toFloatOrNull()?.coerceIn(0.25f, 4f) ?: 1f
        val volume = int("volume").coerceIn(0, 100) / 100f
        if (volume == 0f) return

        val indices = letters(text.lowercase(Locale.ROOT))
        if (indices.isEmpty()) return
        val output = FloatArray(maxOf(1, (sampleRate * indices.size * 0.1).toInt()))
        val slot = (sampleRate * (0.09 / speed)).toInt()
        val question = text.endsWith("?")
        var offset = 0
        for (i in indices.indices) {
            val clip = clips[indices[i]]
            if (clip != null) {
                var shift = 2.8f * pitch + random.nextFloat() * 0.15f
                if (question && i >= indices.size * 0.8) {
                    val progress = (i - indices.size * 0.8f) / (indices.size * 0.2f)
                    shift += progress * 0.1f + 0.1f
                }
                val input = clip.samples
                val length = (input.size / shift).toInt()
                for (j in 0 until length) {
                    val from = (j * shift).toInt()
                    val to = offset + j
                    if (from >= input.size || to >= output.size) break
                    output[to] = input[from]
                }
            }
            offset += slot
        }

        val pcm = ShortArray(output.size) { (output[it] * volume).coerceIn(-1f, 1f).times(Short.MAX_VALUE).toInt().toShort() }
        // Like the PC plugin, the whole clip also plays faster or slower with the pitch
        val rate = (sampleRate * pitch).toInt().coerceIn(4000, 192000)
        play(pcm, rate)
    }

    /** The letter sounds for [text], the way Animal Crossing reads it. */
    private fun letters(text: String): List<String> {
        val out = ArrayList<String>()
        var i = 0
        while (i < text.length) {
            val c = text[i]
            val next = text.getOrNull(i + 1)
            val previous = text.getOrNull(i - 1)
            when {
                c == 's' && next == 'h' -> { out += "sound27"; i++ }
                c == 't' && next == 'h' -> { out += "sound28"; i++ }
                c == 'h' && (previous == 's' || previous == 't') -> {}
                c == ',' || c == '?' -> out += "sound30"
                c == previous -> {}
                c in 'a'..'z' -> {
                    val index = c - 'a' + 1
                    out += "sound" + (if (index < 10) "0$index" else "$index")
                }
            }
            i++
        }
        return out
    }

    private fun play(pcm: ShortArray, sampleRate: Int) {
        releaseTrack()
        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        val format = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(sampleRate)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build()
        val track = AudioTrack.Builder()
            .setAudioAttributes(attributes)
            .setAudioFormat(format)
            .setBufferSizeInBytes(pcm.size * 2)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
        track.write(pcm, 0, pcm.size)
        track.play()
        this.track = track
    }

    private fun releaseTrack() {
        val old = track ?: return
        track = null
        try {
            old.stop()
        } catch (_: Throwable) {
        }
        old.release()
    }

    /** Reads PCM (8, 16, 24 or 32 bit) or 32 bit float WAV data into mono samples. */
    private fun decodeWav(bytes: ByteArray): Clip? {
        fun u16(at: Int) = (bytes[at].toInt() and 0xff) or ((bytes[at + 1].toInt() and 0xff) shl 8)
        fun i32(at: Int) = u16(at) or (u16(at + 2) shl 16)
        if (bytes.size < 12 || String(bytes, 0, 4, Charsets.US_ASCII) != "RIFF" || String(bytes, 8, 4, Charsets.US_ASCII) != "WAVE") return null

        var format = 0
        var channels = 1
        var sampleRate = 44100
        var bits = 16
        var position = 12
        while (position + 8 <= bytes.size) {
            val id = String(bytes, position, 4, Charsets.US_ASCII)
            val size = i32(position + 4)
            val body = position + 8
            if (id == "fmt " && body + 16 <= bytes.size) {
                format = u16(body)
                channels = u16(body + 2).coerceAtLeast(1)
                sampleRate = i32(body + 4)
                bits = u16(body + 14)
                if (format == 0xFFFE && body + 26 <= bytes.size) format = u16(body + 24)
            } else if (id == "data") {
                val end = minOf(bytes.size, body + size)
                val frameBytes = bits / 8 * channels
                if (frameBytes <= 0 || sampleRate <= 0) return null
                val frames = (end - body) / frameBytes
                val samples = FloatArray(frames)
                for (f in 0 until frames) {
                    var sum = 0f
                    for (ch in 0 until channels) {
                        val at = body + f * frameBytes + ch * (bits / 8)
                        sum += when {
                            format == 3 && bits == 32 -> java.lang.Float.intBitsToFloat(i32(at))
                            bits == 8 -> ((bytes[at].toInt() and 0xff) - 128) / 128f
                            bits == 16 -> u16(at).toShort() / 32768f
                            bits == 24 -> (((bytes[at].toInt() and 0xff) shl 8) or ((bytes[at + 1].toInt() and 0xff) shl 16) or
                                (bytes[at + 2].toInt() shl 24)) / 2147483648f
                            bits == 32 -> i32(at) / 2147483648f
                            else -> 0f
                        }
                    }
                    samples[f] = sum / channels
                }
                return Clip(samples, sampleRate)
            }
            position = body + size + (size and 1)
        }
        return null
    }

    private companion object {
        const val BASE_URL = "https://raw.githubusercontent.com/Equicord/Equibored/main/sounds/animalese"
        val url: Pattern = Pattern.compile("https?://\\S+")
    }
}
