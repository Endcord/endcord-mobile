/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.songlink

import android.content.Context
import com.aliucord.Utils
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.commandscommon.Dialogs
import com.endcord.plugins.commandscommon.Net
import com.endcord.plugins.commandscommon.Options
import com.lytefast.flexinput.R
import java.util.regex.Pattern

/**
 * Endcord PC draws service buttons under every message with a song link. The Android chat has no room for
 * them, so "Song links" in the message long-press menu looks the song up on song.link and lists the services;
 * tapping one opens it (in the service's app when it is installed). /musiclink works like on PC.
 */
internal class SongLink : EndcordPlugin(
    name = "SongLink",
    description = "Find a song link on other streaming services from the message long-press menu, or with /musiclink.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("media", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            key = "userCountry",
            label = "Country used for lookup (Two letter country code)",
            default = "US",
        ),
        PluginSetting.Switch(
            key = "includeMetadata",
            label = "Include the track title and artist name as a header.",
            default = true,
        ),
    )

    private class Link(val service: String, val url: String)

    private class Track(val title: String?, val artist: String?, val links: List<Link>)

    override fun start(context: Context) {
        MessageActions.register(
            name,
            "Song links",
            R.e.ic_open_in_new_white_24dp,
            visible = { SONG_LINK.matcher(it.message.content ?: "").find() },
        ) { ctx ->
            val links = ArrayList<String>()
            val matcher = SONG_LINK.matcher(ctx.message.content ?: "")
            while (matcher.find()) if (matcher.group() !in links) links += matcher.group()
            val activity = ctx.sheet.requireActivity()
            if (links.size == 1) {
                showServices(activity, links[0])
            } else {
                Dialogs.showList(activity, I18n.t("Song links"), links) { showServices(activity, links[it]) }
            }
        }

        commands.registerCommand(
            "musiclink",
            "Convert a music link to other streaming platforms.",
            listOf(Options.string("url", "Music link (Spotify, Deezer, YouTube, Tidal, Apple Music, SoundCloud)", required = true)),
        ) { ctx ->
            val url = ctx.getRequiredString("url").trim()
            val track = try {
                lookUp(url)
            } catch (e: Throwable) {
                logger.error("Failed to resolve $url", e)
                return@registerCommand CommandResult(I18n.t("Failed to resolve music link"), null, false)
            }
            if (track.links.isEmpty()) return@registerCommand CommandResult(I18n.t("No alternative platforms found for this link."), null, false)

            val lines = ArrayList<String>()
            if (bool("includeMetadata") && track.title != null && track.artist != null) {
                lines += "### **${track.title}** — *${track.artist}*"
            }
            for (link in track.links) lines += "- [${link.service}](<${link.url}>)"
            CommandResult(lines.joinToString("\n"), null, true)
        }
    }

    private fun showServices(context: Context, url: String) {
        Utils.showToast(I18n.t("This will take a moment..."))
        Utils.threadPool.execute {
            val track = try {
                lookUp(url)
            } catch (e: Throwable) {
                logger.error("Failed to resolve $url", e)
                null
            }
            Utils.mainThread.post {
                when {
                    track == null -> Utils.showToast(I18n.t("Failed to resolve music link"))
                    track.links.isEmpty() -> Utils.showToast(I18n.t("No alternative platforms found for this link."))
                    else -> {
                        val title = if (track.title != null && track.artist != null) "${track.title} — ${track.artist}" else I18n.t("Song links")
                        try {
                            Dialogs.showList(context, title, track.links.map { it.service }) { Utils.launchUrl(track.links[it].url) }
                        } catch (e: Throwable) {
                            // The activity went away while the lookup ran
                            logger.error("Failed to show the song links", e)
                        }
                    }
                }
            }
        }
    }

    /** Asks song.link for the same song on every service. Blocking, call off the main thread. */
    private fun lookUp(url: String): Track {
        val country = string("userCountry").trim().ifEmpty { "US" }
        val json = Net.getObject(
            "https://api.song.link/v1-alpha.1/links?url=${Net.encodeURIComponent(url)}&userCountry=${Net.encodeURIComponent(country)}",
        )

        var title: String? = null
        var artist: String? = null
        val entities = json.optJSONObject("entitiesByUniqueId")
        if (entities != null) {
            val keys = entities.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                // Like PC: YouTube's titles are video titles, so prefer any other service's metadata
                if (key.contains("YOUTUBE")) continue
                val entity = entities.optJSONObject(key) ?: continue
                title = entity.optString("title").ifEmpty { null }
                artist = entity.optString("artistName").ifEmpty { null }
                break
            }
        }

        val links = ArrayList<Link>()
        val platforms = json.optJSONObject("linksByPlatform")
        if (platforms != null) {
            // Keep PC's service order
            var i = 0
            while (i + 1 < SERVICES.size) {
                val link = platforms.optJSONObject(SERVICES[i])?.optString("url")
                if (!link.isNullOrEmpty()) links += Link(SERVICES[i + 1], link)
                i += 2
            }
        }
        return Track(title, artist, links)
    }

    private companion object {
        /** The links Endcord PC shows buttons for. */
        val SONG_LINK: Pattern = Pattern.compile(
            "https://(?:open|play)\\.spotify\\.com/track/[a-zA-Z0-9]+" +
                "|https://(?:music|itunes)\\.apple\\.com/[a-z]{2}/album/\\S+" +
                "|https://music\\.youtube\\.com/watch\\?v=[0-9A-Za-z_-]+" +
                "|https://tidal\\.com/track/[0-9]+/u",
        )

        /** song.link platform keys followed by their names, in Endcord PC's order. */
        val SERVICES = arrayOf(
            "amazonMusic", "Amazon Music",
            "spotify", "Spotify",
            "itunes", "iTunes",
            "appleMusic", "Apple Music",
            "youtube", "YouTube",
            "youtubeMusic", "YouTube Music",
            "google", "Google",
            "googleMusic", "Google Music",
            "pandora", "Pandora",
            "deezer", "Deezer",
            "tidal", "Tidal",
            "amazonStore", "Amazon Store",
            "soundcloud", "SoundCloud",
            "napster", "Napster",
            "yandex", "Yandex",
            "spinrilla", "Spinrilla",
            "audius", "Audius",
            "audiomack", "Audiomack",
            "anghami", "Anghami",
            "boomplay", "Boomplay",
            "bandcamp", "Bandcamp",
        )
    }
}
