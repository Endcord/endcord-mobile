/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.universalvolume

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.discord.stores.StoreStream
import com.endcord.plugins.voicecommon.Voice
import com.endcord.plugins.voicecommon.VoiceEvents

internal class UniversalVolume : EndcordPlugin(
    name = "UniversalVolume",
    description = "Sets everyone in your voice channel to the same volume, and keeps new people who join at that level too.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("voice", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Number(
            "targetVolume",
            "The volume everyone in your voice channel is set to.",
            "In percent, 100 is normal",
            default = 100,
            min = 0,
            max = 200,
        ),
    )

    /** Main thread only. */
    private var currentChannel = 0L
    private val leveled = HashSet<Long>()

    /** Port of levelChannel. Main thread. */
    private fun levelChannel() {
        val channelId = Voice.myChannelId()
        if (channelId != currentChannel) {
            leveled.clear()
            currentChannel = channelId
        }
        if (channelId == 0L) return
        val me = Voice.myId()
        val volume = int("targetVolume").coerceIn(0, 200).toFloat()
        val media = StoreStream.getMediaSettings()
        for (state in Voice.statesIn(channelId)) {
            val userId = state.m()
            if (userId == me || !leveled.add(userId)) continue
            try {
                media.setUserOutputVolume(userId, volume)
            } catch (e: Throwable) {
                logger.error("Failed to set the volume of $userId", e)
            }
        }
    }

    private fun relevelAll() {
        leveled.clear()
        levelChannel()
    }

    override fun start(context: Context) {
        VoiceEvents.register(name) { change ->
            val mine = Voice.myChannelId()
            if (change.isMe || (mine != 0L && change.touches(mine))) {
                // The snapshot read by statesIn is published once the store finishes this update
                Utils.mainThread.postDelayed({ levelChannel() }, 250L)
            }
        }
        Utils.mainThread.post { levelChannel() }
    }

    override fun onSettingChanged(key: String) {
        if (key == "targetVolume") relevelAll()
    }

    override fun stop(context: Context) {
        super.stop(context)
        VoiceEvents.unregisterAll(name)
        Utils.mainThread.post {
            leveled.clear()
            currentChannel = 0L
        }
    }
}
