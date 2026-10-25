/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.notifycommon

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.RingtoneManager
import android.media.SoundPool
import com.aliucord.Http
import com.aliucord.Logger
import com.aliucord.Utils
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ConcurrentHashMap

/**
 * Short sound effects for the fun plugins (Moyai and friends).
 *
 * Clips are downloaded once into the app's cache on a background thread and played through one shared
 * [SoundPool], which is cheap enough to fire for every message. Nothing plays unless the phone's ringer is on
 * (silent and vibrate mode mean silence), and the sounds use the notification usage so the system's
 * notification volume and Do Not Disturb rules apply.
 */
internal object Sounds {
    private val logger = Logger("Sounds")
    private val loaded = ConcurrentHashMap<String, Int>()
    private val loading = ConcurrentHashMap<String, Boolean>()
    private var pool: SoundPool? = null

    /** Whether the phone's ringer allows sounds right now. */
    fun ringerAllowsSound(): Boolean = try {
        val audio = Utils.appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audio.ringerMode == AudioManager.RINGER_MODE_NORMAL
    } catch (_: Throwable) {
        false
    }

    @Synchronized
    private fun pool(): SoundPool {
        pool?.let { return it }
        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        return SoundPool.Builder().setMaxStreams(4).setAudioAttributes(attributes).build().also { pool = it }
    }

    /** Downloads [url] into the cache once (off the main thread). */
    fun cachedFile(url: String): File? {
        val dir = File(Utils.appContext.cacheDir, "endcord-sounds").apply { mkdirs() }
        val file = File(dir, Integer.toHexString(url.hashCode()) +"." + url.substringAfterLast('.').substringBefore('?').take(4))
        if (file.length() > 0L) return file
        return try {
            val part = File(dir, file.name + ".part")
            Http.Request(url).execute().use { response ->
                if (!response.ok()) return null
                FileOutputStream(part).use { response.pipe(it) }
            }
            if (part.renameTo(file)) file else null
        } catch (e: Throwable) {
            logger.error("Failed to download $url", e)
            null
        }
    }

    /** Starts downloading and decoding [url] so the first [play] is instant. */
    fun preload(url: String) {
        if (loaded.containsKey(url) || loading.putIfAbsent(url, true) != null) return
        Utils.threadPool.execute {
            try {
                val file = cachedFile(url) ?: return@execute
                val id = pool().load(file.absolutePath, 1)
                if (id != 0) loaded[url] = id
            } catch (e: Throwable) {
                logger.error("Failed to load $url", e)
            } finally {
                loading.remove(url)
            }
        }
    }

    /** Plays [url] at [volume] (0 to 1) if the ringer is on. The first call only loads the clip. */
    fun play(url: String, volume: Float) {
        if (volume <= 0f || !ringerAllowsSound()) return
        val id = loaded[url]
        if (id == null) {
            preload(url)
            return
        }
        val v = volume.coerceIn(0f, 1f)
        pool().play(id, v, v, 1, 0, 1f)
    }

    /** Plays the phone's default notification sound, like a notification would. */
    fun playNotificationSound() {
        if (!ringerAllowsSound()) return
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION) ?: return
            RingtoneManager.getRingtone(Utils.appContext, uri)?.play()
        } catch (e: Throwable) {
            logger.error("Failed to play the notification sound", e)
        }
    }

    /** Frees the sounds once no plugin needs them. */
    @Synchronized
    fun release() {
        pool?.release()
        pool = null
        loaded.clear()
    }
}
