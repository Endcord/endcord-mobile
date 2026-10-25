/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.voicecommon

import com.aliucord.Logger
import com.aliucord.api.PatcherAPI
import com.aliucord.patcher.before
import com.discord.stores.StoreGatewayConnection
import com.discord.stores.StoreRtcConnection
import com.discord.stores.StoreStream
import java.lang.reflect.Method

/**
 * What FakeMute and FakeDeafen tell the server. The app keeps its real microphone and speaker state; only the
 * voice state sent over the gateway (`StoreGatewayConnection.voiceStateUpdate`, which the app calls with its real
 * flags) is changed, so others see the mute or deafen icon. Flags live in memory only: a restart, or turning the
 * plugin off, always goes back to the real state.
 */
internal object FakeVoiceState {
    private val logger = Logger("FakeVoiceState")

    @Volatile
    var fakeMute = false
        private set

    @Volatile
    var fakeDeaf = false
        private set

    private var patched = false

    private val onVoiceStateUpdated: Method by lazy {
        StoreRtcConnection::class.java.getDeclaredMethod("onVoiceStateUpdated").apply { isAccessible = true }
    }

    fun setFakeMute(value: Boolean) {
        if (fakeMute == value) return
        fakeMute = value
        ensurePatched()
        resend()
    }

    fun setFakeDeaf(value: Boolean) {
        if (fakeDeaf == value) return
        fakeDeaf = value
        ensurePatched()
        resend()
    }

    @Synchronized
    private fun ensurePatched() {
        if (patched) return
        patched = true
        // voiceStateUpdate(guildId, channelId, selfMute, selfDeaf, selfVideo, preferredRegion, shouldIncludePreferredRegion)
        PatcherAPI(logger).before<StoreGatewayConnection>(
            "voiceStateUpdate",
            Long::class.javaObjectType,
            Long::class.javaObjectType,
            Boolean::class.javaPrimitiveType!!,
            Boolean::class.javaPrimitiveType!!,
            Boolean::class.javaPrimitiveType!!,
            String::class.java,
            Boolean::class.javaPrimitiveType!!,
        ) { param ->
            if (param.args[1] == null) return@before // leaving: nothing to fake
            if (fakeMute) param.args[2] = true
            if (fakeDeaf) {
                // Deafened always implies muted, like Discord's own deafen
                param.args[2] = true
                param.args[3] = true
            }
        }
    }

    /** Sends the current voice state again, so a toggle shows for others right away. */
    private fun resend() {
        if (Voice.myChannelId() == 0L) return
        try {
            StoreStream.getDispatcherYesThisIsIntentional().schedule {
                try {
                    onVoiceStateUpdated.invoke(StoreStream.getRtcConnection())
                } catch (e: Throwable) {
                    logger.error("Failed to resend the voice state", e)
                }
            }
        } catch (e: Throwable) {
            logger.error("Failed to schedule a voice state update", e)
        }
    }
}
