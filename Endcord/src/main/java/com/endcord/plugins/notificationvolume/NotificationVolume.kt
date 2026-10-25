/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.notificationvolume

import android.content.Context
import android.media.MediaPlayer
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.before
import com.discord.utilities.media.AppSoundManager
import java.lang.reflect.Field

internal class NotificationVolume : EndcordPlugin(
    name = "NotificationVolume",
    description = "Save your ears and set a separate volume for Discord's in-app sounds, like calls, joins, leaves and mute toggles",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("notifications", "voice")

    override val settingsSchema = listOf(
        PluginSetting.Number(
            "notificationVolume",
            "Volume",
            "Volume of Discord's in-app sounds, in percent. Notification sounds in the notification shade follow Android's notification volume.",
            100,
            0,
            100,
        ),
    )

    override fun start(context: Context) {
        // Every in-app sound (ringing, joins, leaves, mute and deafen, streams) is played by a SoundPlayer
        patcher.before<AppSoundManager.SoundPlayer>("start") {
            try {
                val player = playerField?.get(this) as MediaPlayer? ?: return@before
                val volume = int("notificationVolume").coerceIn(0, 100) / 100f
                player.setVolume(volume, volume)
            } catch (e: Throwable) {
                logger.error("Failed to set the sound volume", e)
            }
        }
    }

    private companion object {
        val playerField: Field? = try {
            AppSoundManager.SoundPlayer::class.java.getDeclaredField("mediaPlayer").apply { isAccessible = true }
        } catch (_: Throwable) {
            null
        }
    }
}
