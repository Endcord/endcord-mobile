/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.nopushtotalk

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.patcher.before
import com.discord.stores.StoreMediaSettings
import com.discord.stores.StoreStream
import com.endcord.plugins.voicecommon.Voice
import java.lang.reflect.Method

internal class NoPushToTalk : EndcordPlugin(
    name = "NoPushToTalk",
    description = "Bypasses the push-to-talk requirement for voice activity in channels that enforce it.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("voice", "servers")

    /**
     * The app learns whether the current channel allows voice activity through `handleCanUseVad`; when it
     * doesn't, users on voice activity are force muted until they switch to push to talk.
     */
    private val handleCanUseVad: Method by lazy {
        StoreMediaSettings::class.java.getDeclaredMethod("handleCanUseVad", Boolean::class.javaPrimitiveType!!)
            .apply { isAccessible = true }
    }

    private fun apply(canUseVad: Boolean) {
        try {
            StoreStream.getDispatcherYesThisIsIntentional().schedule {
                try {
                    handleCanUseVad.invoke(StoreStream.getMediaSettings(), canUseVad)
                } catch (e: Throwable) {
                    logger.error("Failed to update voice activity", e)
                }
            }
        } catch (e: Throwable) {
            logger.error("Failed to schedule a voice activity update", e)
        }
    }

    override fun start(context: Context) {
        patcher.before<StoreMediaSettings>("handleCanUseVad", Boolean::class.javaPrimitiveType!!) { param ->
            param.args[0] = true
        }
        // Lift a requirement that is already in force for the current channel
        apply(true)
    }

    override fun stop(context: Context) {
        super.stop(context)
        // Give the current channel its real rule back
        val channel = Voice.channel(Voice.myChannelId())
        apply(channel == null || Voice.can(channel, PERM_USE_VAD))
    }

    private companion object {
        const val PERM_USE_VAD = 1L shl 25
    }
}
