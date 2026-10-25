/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.musicrichpresence

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.entities.PluginSetting.Choice.Option
import com.discord.api.activity.ActivityType
import com.endcord.plugins.presencecommon.MusicActivity
import com.endcord.plugins.presencecommon.MusicOptions
import com.endcord.plugins.presencecommon.Poller
import com.endcord.plugins.presencecommon.PresenceHub
import com.endcord.plugins.presencecommon.Scrobblers
import com.endcord.plugins.presencecommon.Track

internal class MusicRichPresence : EndcordPlugin(
    name = "MusicRichPresence",
    description = "Rich Presence for Last.FM/Listenbrainz",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("activity", "media")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            "scrobblerBackend", "The scrobbler backend to use.", null,
            listOf(
                Option("lastfm", "Last.FM"),
                Option("listenbrainz", "ListenBrainz"),
                Option("listenbrainz-compatible", "ListenBrainz Compatible (self-hosted)"),
            ),
        ),
        PluginSetting.Text("username", "Username"),
        PluginSetting.Text(
            "apiKey", "API Key",
            "Last.fm API key. Not required but highly recommended to avoid rate limiting with our shared key",
        ),
        PluginSetting.Text(
            "instanceBaseURL", "The base url of your ListenBrainz instance.",
            "Only for ListenBrainz Compatible (self-hosted)", placeholder = "https://example.org",
        ),
        PluginSetting.Text(
            "instanceAPIBaseUrl", "The base url of your ListenBrainz API.",
            "Only for ListenBrainz Compatible (self-hosted)", placeholder = "https://api.example.org",
        ),
        PluginSetting.Switch("shareUsername", "Show link to scrobbler profile", null, false),
        PluginSetting.Switch("hideWithSpotify", "Hide presence if Spotify is running", null, true),
        PluginSetting.Switch("hideWithActivity", "Hide presence if you have any other presence", null, false),
        PluginSetting.Text(
            "statusName", "Custom status text",
            "You can use the following variables: {artist} | {album} | {title}", "some music",
        ),
        PluginSetting.Choice(
            "nameFormat", "Show name of song and artist in status name", null,
            MusicActivity.nameFormats + Option("service-name", "Use music service name (falls back to custom status text)"),
        ),
        PluginSetting.Switch("useListeningStatus", "Show \"Listening to\" status instead of \"Playing\"", null, false),
        PluginSetting.Choice(
            "missingArt", "When album or album art is missing", null,
            listOf(Option("lastfmLogo", "Use large scrobbler logo"), Option("placeholder", "Use generic placeholder")),
        ),
        PluginSetting.Switch("showLogo", "Show Scrobbler Logo", "Show the scrobbler service logo by the album cover", true),
        PluginSetting.Switch(
            "showAlbumCover", "Show album cover",
            "Disabling this will display a placeholder. Useful if your music has inappropriate art", true,
        ),
    )

    @Volatile
    private var running = false
    private val poller = Poller(name, POLL_SECONDS) { update() }

    override fun start(context: Context) {
        running = true
        poller.start()
    }

    override fun stop(context: Context) {
        poller.stop()
        synchronized(this) {
            running = false
            PresenceHub.unregisterAll(name)
        }
        super.stop(context)
    }

    override fun onSettingChanged(key: String) = poller.poke()

    private fun update() {
        val activity = run {
            val username = string("username").trim()
            if (username.isEmpty()) return@run null
            if (bool("hideWithActivity") && (PresenceHub.appHasActivity(null) || PresenceHub.othersProvide(name))) return@run null
            if (bool("hideWithSpotify") && PresenceHub.appHasActivity(ActivityType.LISTENING)) return@run null

            val backend = choice("scrobblerBackend")
            val track: Track
            val service: String
            val serviceName: String
            val profile: String
            if (backend == "lastfm") {
                track = Scrobblers.lastFm(string("apiKey").trim(), username) ?: return@run null
                service = "lastfm"
                serviceName = "Last.FM"
                profile = Scrobblers.lastFmProfile(username)
            } else {
                val custom = backend == "listenbrainz-compatible"
                val api = if (custom) string("instanceAPIBaseUrl").trim() else "https://api.listenbrainz.org"
                val web = if (custom) string("instanceBaseURL").trim() else "https://listenbrainz.org"
                // A self-hosted instance needs both addresses, like on Endcord PC
                if (custom && (!api.startsWith("http") || !web.startsWith("http"))) return@run null
                track = Scrobblers.listenBrainz(api, username) ?: return@run null
                service = "listenbrainz"
                serviceName = "ListenBrainz"
                profile = Scrobblers.listenBrainzProfile(web, username)
            }

            MusicActivity.build(
                track,
                MusicOptions(
                    service = service,
                    statusName = string("statusName"),
                    nameFormat = choice("nameFormat"),
                    listening = bool("useListeningStatus"),
                    placeholderWhenMissing = choice("missingArt") == "placeholder",
                    showLogo = bool("showLogo"),
                    showAlbumCover = bool("showAlbumCover"),
                    profileButton = if (bool("shareUsername")) "$serviceName Profile" else null,
                    profileUrl = profile,
                ),
            )
        }
        synchronized(this) {
            if (running) PresenceHub.setActivity(name, activity)
        }
    }

    private companion object {
        const val POLL_SECONDS = 20L
    }
}
