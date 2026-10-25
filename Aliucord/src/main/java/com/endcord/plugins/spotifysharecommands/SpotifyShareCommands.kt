/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.spotifysharecommands

import android.content.Context
import com.aliucord.api.CommandsAPI
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.tr
import com.discord.models.domain.spotify.ModelSpotifyTrack
import com.discord.stores.StoreSpotify
import com.discord.stores.StoreStream

internal class SpotifyShareCommands : EndcordPlugin(
    name = "SpotifyShareCommands",
    description = "Share your current Spotify track, album or artist via slash command (/track, /album, /artist)",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("media", "commands")

    override fun start(context: Context) {
        register("track") { track -> track.id?.let { "https://open.spotify.com/track/$it" } }
        register("album") { track -> track.album?.id?.let { "https://open.spotify.com/album/$it" } }
        register("artist") { track -> track.artists?.firstOrNull()?.id?.let { "https://open.spotify.com/artist/$it" } }
    }

    private fun register(name: String, formatUrl: (ModelSpotifyTrack) -> String?) {
        commands.registerCommand(name, "Share your current Spotify $name in chat", CommandsAPI.messageOption) { ctx ->
            // Discord follows the Spotify app's playback broadcasts and looks the track up; that is what we read here
            val track = StoreSpotify.`access$getSpotifyState$p`(StoreStream.getSpotify())?.track
                ?: return@registerCommand CommandResult(tr("You're not listening to any music."), null, false)
            // Local files have no Spotify id
            val url = (if (track.isLocal) null else formatUrl(track))
                ?: return@registerCommand CommandResult(tr("Failed to find the track on spotify."), null, false)
            val message = ctx.getStringOrDefault("message", "").trim()
            CommandResult(if (message.isEmpty()) url else "$message $url", null, true)
        }
    }
}
