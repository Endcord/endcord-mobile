/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.showsongname

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.patcher.before
import com.discord.api.activity.Activity
import com.discord.utilities.presence.ActivityUtilsKt
import com.discord.utilities.presence.PresenceUtils
import com.endcord.plugins.presencecommon.Activities

internal class ShowSongName : EndcordPlugin(
    name = "ShowSongName",
    description = "Shows song name instead of artist for Spotify activity",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("activity")

    override fun start(context: Context) {
        // Builds the "Listening to Spotify" line under names in the member list, DMs and profiles
        patcher.before<PresenceUtils>("getActivityString", Context::class.java, Activity::class.java) { param ->
            try {
                val activity = param.args[1] as Activity? ?: return@before
                if (!ActivityUtilsKt.isSpotifyActivity(activity)) return@before
                val song = activity.e()
                if (!song.isNullOrBlank()) param.args[1] = Activities.withName(activity, song)
            } catch (e: Throwable) {
                logger.error("Failed to show the song name", e)
            }
        }
    }
}
