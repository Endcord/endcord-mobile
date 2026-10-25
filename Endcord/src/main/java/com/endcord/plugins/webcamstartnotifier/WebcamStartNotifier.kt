/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.webcamstartnotifier

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.endcord.plugins.voicecommon.Sounds
import com.endcord.plugins.voicecommon.Voice
import com.endcord.plugins.voicecommon.VoiceEvents

internal class WebcamStartNotifier : EndcordPlugin(
    name = "WebcamStartNotifier",
    description = "Plays a sound when someone enables/disables their camera in a voice channel",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("voice", "notifications")

    override val settingsSchema = listOf(
        PluginSetting.Switch("playInPrivate", "Play notification sound in private voice calls (DMs)", default = true),
        PluginSetting.Switch("playInServer", "Play notification sound in server voice channels", default = true),
    )

    override fun start(context: Context) {
        VoiceEvents.register(name) { change ->
            if (!change.videoChanged || change.isMe) return@register
            val mine = Voice.myChannelId()
            if (mine == 0L || change.newChannelId != mine) return@register
            val channel = Voice.channel(mine) ?: return@register
            if (!bool(if (Voice.isPrivate(channel)) "playInPrivate" else "playInServer")) return@register
            val on = change.new?.j() == true
            Utils.mainThread.post { if (on) Sounds.cameraOn() else Sounds.cameraOff() }
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        VoiceEvents.unregisterAll(name)
    }
}
