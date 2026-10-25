/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.lastfmrichpresence

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

internal class LastFMRichPresence : EndcordPlugin(
    name = "LastFMRichPresence",
    description = "Little plugin for Last.fm rich presence",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("activity", "media")

    override val settingsSchema = listOf(
        PluginSetting.Text("username", "Last.fm username"),
        PluginSetting.Text(
            "apiKey", "API Key",
            "Custom Last.fm API key. Not required but highly recommended to avoid rate limiting with our shared key",
        ),
        PluginSetting.Switch("shareUsername", "Show link to Last.fm profile", null, false),
        PluginSetting.Switch("hideWithSpotify", "Hide Last.fm presence if spotify is running", null, true),
        PluginSetting.Switch("hideWithActivity", "Hide Last.fm presence if you have any other presence", null, false),
        PluginSetting.Text(
            "statusName", "Custom status text",
            "You can use the following variables: {artist} | {album} | {title}", "some music",
        ),
        PluginSetting.Choice("nameFormat", "Show name of song and artist in status name", null, MusicActivity.nameFormats),
        PluginSetting.Switch("useListeningStatus", "Show \"Listening to\" status instead of \"Playing\"", null, false),
        PluginSetting.Choice(
            "missingArt", "When album or album art is missing", null,
            listOf(Option("lastfmLogo", "Use large Last.fm logo"), Option("placeholder", "Use generic placeholder")),
        ),
        PluginSetting.Switch("showLastFmLogo", "Show Last.fm Logo", "Show the Last.fm logo by the album cover", true),
        PluginSetting.Switch(
            "showAlbumCover", "Show album cover",
            "Disabling this will display a placeholder. Useful if your Music has inappropriate art", true,
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
            val track = Scrobblers.lastFm(string("apiKey").trim(), username) ?: return@run null
            MusicActivity.build(
                track,
                MusicOptions(
                    service = "lastfm",
                    statusName = string("statusName"),
                    nameFormat = choice("nameFormat"),
                    listening = bool("useListeningStatus"),
                    placeholderWhenMissing = choice("missingArt") == "placeholder",
                    showLogo = bool("showLastFmLogo"),
                    showAlbumCover = bool("showAlbumCover"),
                    profileButton = if (bool("shareUsername")) "Last.fm Profile" else null,
                    profileUrl = Scrobblers.lastFmProfile(username),
                ),
            )
        }
        synchronized(this) {
            if (running) PresenceHub.setActivity(name, activity)
        }
    }

    private companion object {
        /** Endcord PC polls every 16 seconds; a little slower on a phone. */
        const val POLL_SECONDS = 20L
    }
}
