/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.presencecommon

import android.app.ActivityManager
import com.aliucord.Http
import com.aliucord.Logger
import com.aliucord.entities.PluginSetting
import com.discord.api.activity.Activity
import com.discord.api.activity.ActivityType
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern

/** A track a scrobbler reports as playing right now. */
internal class Track(
    val name: String,
    val artist: String,
    val album: String?,
    val imageUrl: String?,
    val serviceName: String?,
)

/** Reads what is playing from Last.fm and ListenBrainz, ported from Endcord PC's MusicRichPresence backends. */
internal object Scrobblers {
    private val logger = Logger("Endcord/Scrobblers")

    /** Endcord PC's shared Last.fm key. Last.fm API keys are public and have no access to anyone's account. */
    const val LASTFM_SHARED_KEY = "790c37d90400163a5a5fe00d6ca32ef0"
    private const val LASTFM_PLACEHOLDER_IMAGE_HASH = "2a96cbd8b46e442fc41c2b86b821562f"
    private const val TIMEOUT_MS = 10_000
    private const val COVER_TTL_MS = 15 * 60 * 1000L

    private val youtubeUrl =
        Pattern.compile("^((?:https?:)?//)?((?:www|m)\\.)?((?:youtube(?:-nocookie)?\\.com|youtu.be))(/(?:[\\w-]+\\?v=|embed/|live/|v/)?)([\\w-]+)(\\S+)?$")

    private val COVER_KINDS = arrayOf("release", "release-group")
    private val COVER_KEYS = arrayOf("release_mbid", "release_group_mbid")

    private class Cover(val url: String?, val time: Long)

    private val covers = object : LinkedHashMap<String, Cover>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Cover>?) = size > 64
    }

    private fun enc(text: String) = URLEncoder.encode(text, "UTF-8")

    private fun getJson(url: String): JSONObject {
        val res = Http.Request(url).setRequestTimeout(TIMEOUT_MS).execute()
        res.assertOk()
        return JSONObject(res.text())
    }

    fun lastFmProfile(username: String) = "https://www.last.fm/user/${enc(username)}"

    fun lastFm(apiKey: String, username: String): Track? {
        val json = getJson(
            "https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&limit=1&format=json" +
                "&api_key=${enc(apiKey.ifBlank { LASTFM_SHARED_KEY })}&user=${enc(username)}",
        )
        if (json.has("error")) {
            logger.error("Error from Last.fm: ${json.optString("error")} ${json.optString("message")}", null)
            return null
        }
        val tracks = json.optJSONObject("recenttracks")?.opt("track")
        val track = (if (tracks is JSONArray) tracks.optJSONObject(0) else tracks as? JSONObject) ?: return null
        if (track.optJSONObject("@attr")?.optString("nowplaying") != "true") return null
        var image: String? = null
        track.optJSONArray("image")?.let { images ->
            for (i in 0 until images.length()) {
                val entry = images.optJSONObject(i) ?: continue
                if (entry.optString("size") == "large") image = entry.optString("#text").ifEmpty { null }
            }
        }
        if (image?.contains(LASTFM_PLACEHOLDER_IMAGE_HASH) == true) image = null
        return Track(
            name = track.optString("name").ifEmpty { "Unknown" },
            artist = track.optJSONObject("artist")?.optString("#text").orEmpty().ifEmpty { "Unknown" },
            album = track.optJSONObject("album")?.optString("#text")?.ifEmpty { null },
            imageUrl = image,
            serviceName = null,
        )
    }

    fun listenBrainzProfile(webBase: String, username: String) = "${webBase.trimEnd('/')}/user/${enc(username)}"

    fun listenBrainz(apiBase: String, username: String): Track? {
        val json = getJson("${apiBase.trimEnd('/')}/1/user/${enc(username)}/playing-now")
        val listen = json.optJSONObject("payload")?.optJSONArray("listens")?.optJSONObject(0) ?: return null
        if (!listen.optBoolean("playing_now")) return null
        val meta = listen.optJSONObject("track_metadata") ?: return null
        val info = meta.optJSONObject("additional_info")
        return Track(
            name = meta.optString("track_name").ifEmpty { "Unknown" },
            artist = meta.optString("artist_name").ifEmpty { "Unknown" },
            album = meta.optString("release_name").ifEmpty { null },
            imageUrl = info?.let { coverArt(it) },
            serviceName = info?.let { it.optString("music_service_name").ifEmpty { it.optString("submission_client") } }?.ifEmpty { null },
        )
    }

    /** Cover art from the Cover Art Archive, by release then release group, falling back to a YouTube thumbnail. */
    private fun coverArt(info: JSONObject): String? {
        for (i in COVER_KINDS.indices) {
            val kind = COVER_KINDS[i]
            val mbid = info.optString(COVER_KEYS[i])
            if (mbid.isEmpty()) continue
            val now = System.currentTimeMillis()
            val cached = synchronized(covers) { covers[mbid] }
            val url = if (cached != null && now - cached.time < COVER_TTL_MS) cached.url else {
                val found = try {
                    getJson("https://coverartarchive.org/$kind/$mbid").optJSONArray("images")?.optJSONObject(0)
                        ?.optJSONObject("thumbnails")?.optString("large")?.ifEmpty { null }
                } catch (e: Throwable) {
                    null
                }
                synchronized(covers) { covers[mbid] = Cover(found, now) }
                found
            }
            if (url != null) return url
        }
        val origin = info.optString("origin_url")
        val match = youtubeUrl.matcher(origin)
        return if (origin.isNotEmpty() && match.matches()) "https://i.ytimg.com/vi/${match.group(5)}/maxresdefault.jpg" else null
    }
}

/** How a music plugin turns a [Track] into an activity. All the options of Endcord PC's Last.fm presence. */
internal class MusicOptions(
    /** Prefix of the application's image assets: `lastfm` or `listenbrainz`. */
    val service: String,
    val statusName: String,
    val nameFormat: String,
    val listening: Boolean,
    val placeholderWhenMissing: Boolean,
    val showLogo: Boolean,
    val showAlbumCover: Boolean,
    /** Text and link of the profile button, or null for no button. */
    val profileButton: String?,
    val profileUrl: String?,
)

internal object MusicActivity {
    /** The application Endcord PC uses for its music presences, with lastfm-*, listenbrainz-* and placeholder images. */
    const val APP_ID = 1108588077900898414L

    val nameFormats = listOf(
        PluginSetting.Choice.Option("status-name", "Use custom status name"),
        PluginSetting.Choice.Option("artist-first", "Use format 'artist - song'"),
        PluginSetting.Choice.Option("song-first", "Use format 'song - artist'"),
        PluginSetting.Choice.Option("artist", "Use artist name only"),
        PluginSetting.Choice.Option("song", "Use song name only"),
        PluginSetting.Choice.Option("album", "Use album name (falls back to custom status text if song has no album)"),
    )

    private fun custom(template: String, track: Track) = template
        .replace("{artist}", track.artist)
        .replace("{album}", track.album.orEmpty())
        .replace("{title}", track.name)

    /** Builds the activity for [track]. Resolves images over the network: call it from a background thread. */
    fun build(track: Track, options: MusicOptions): Activity {
        val name = when (options.nameFormat) {
            "artist-first" -> "${track.artist} - ${track.name}"
            "song-first" -> "${track.name} - ${track.artist}"
            "artist" -> track.artist
            "song" -> track.name
            "album" -> track.album ?: custom(options.statusName, track)
            "service-name" -> track.serviceName ?: custom(options.statusName, track)
            else -> custom(options.statusName, track)
        }.ifBlank { "some music" }

        val cover = if (options.showAlbumCover) track.imageUrl else null
        val large = cover ?: if (options.placeholderWhenMissing) "placeholder" else null
        val assets = if (large != null) {
            Activities.assets(
                AppAssets.resolve(APP_ID, large), track.album,
                if (options.showLogo) AppAssets.resolve(APP_ID, "${options.service}-small") else null,
                if (options.showLogo) options.service else null,
            )
        } else {
            Activities.assets(AppAssets.resolve(APP_ID, "${options.service}-large"), track.album, null, null)
        }

        val withButton = options.profileButton != null && options.profileUrl != null
        return Activities.create(
            name = name,
            type = if (options.listening) ActivityType.LISTENING else ActivityType.PLAYING,
            applicationId = APP_ID,
            details = track.name,
            state = track.artist,
            assets = assets,
            buttons = if (withButton) listOf(options.profileButton!!) else null,
            buttonUrls = if (withButton) listOf(options.profileUrl!!) else null,
        )
    }
}

/**
 * Runs [task] every [intervalSeconds] on its own background thread while the app is in the foreground,
 * until [stop]. Nothing is polled while Discord is in the background, since it disconnects from the gateway then.
 */
internal class Poller(private val name: String, private val intervalSeconds: Long, private val task: () -> Unit) {
    private val logger = Logger("Endcord/$name")
    private var executor: ScheduledExecutorService? = null
    private var future: ScheduledFuture<*>? = null

    @Synchronized
    fun start() {
        if (executor != null) return
        val ex = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "Endcord-$name").apply { isDaemon = true } }
        executor = ex
        future = ex.scheduleWithFixedDelay({
            try {
                if (isForeground()) task()
            } catch (e: Throwable) {
                logger.error("Update failed", e)
            }
        }, 0, intervalSeconds, TimeUnit.SECONDS)
    }

    /** Runs the task again soon, after a setting changed. */
    @Synchronized
    fun poke() {
        executor?.execute {
            try {
                task()
            } catch (e: Throwable) {
                logger.error("Update failed", e)
            }
        }
    }

    @Synchronized
    fun stop() {
        future?.cancel(false)
        executor?.shutdownNow()
        future = null
        executor = null
    }

    private fun isForeground(): Boolean {
        val info = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(info)
        return info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE
    }
}
