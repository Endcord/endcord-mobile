/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.voicecommon

import com.aliucord.Logger
import com.aliucord.api.PatcherAPI
import com.discord.api.voice.state.VoiceState
import com.discord.stores.StoreStream
import com.discord.stores.StoreVoiceStates
import de.robv.android.xposed.XC_MethodHook
import java.util.concurrent.CopyOnWriteArrayList

/** One gateway voice state update, with the state the user had before it. */
internal class VoiceChange(
    @JvmField val userId: Long,
    @JvmField val guildId: Long,
    /** The user's state before the update, null when they weren't connected. */
    @JvmField val old: VoiceState?,
    /** The user's state after the update, null when they left. */
    @JvmField val new: VoiceState?,
    /**
     * The update itself, as the gateway sent it. When you join on another device the store drops your state
     * here ([new] is null) but this carries the other device's session id.
     */
    @JvmField val incoming: VoiceState,
) {
    /** Whether the update comes from another session of the same user, such as your PC joining a call. */
    val fromOtherSession: Boolean get() = old != null && old.k() != null && incoming.k() != null && old.k() != incoming.k()

    val oldChannelId: Long? get() = old?.a()
    val newChannelId: Long? get() = new?.a()

    val isMe: Boolean get() = userId == Voice.myId()
    val isJoin: Boolean get() = oldChannelId == null && newChannelId != null
    val isLeave: Boolean get() = oldChannelId != null && newChannelId == null
    val isMove: Boolean get() = oldChannelId != null && newChannelId != null && oldChannelId != newChannelId
    val channelChanged: Boolean get() = oldChannelId != newChannelId

    /** Whether the update concerns [channelId], before or after. */
    fun touches(channelId: Long): Boolean = channelId != 0L && (oldChannelId == channelId || newChannelId == channelId)

    val selfMuteChanged: Boolean get() = !channelChanged && old != null && new != null && old.h() != new.h()
    val selfDeafChanged: Boolean get() = !channelChanged && old != null && new != null && old.g() != new.g()
    val serverMuteChanged: Boolean get() = !channelChanged && old != null && new != null && old.e() != new.e()
    val serverDeafChanged: Boolean get() = !channelChanged && old != null && new != null && old.b() != new.b()
    val videoChanged: Boolean get() = !channelChanged && old != null && new != null && old.j() != new.j()
    val streamChanged: Boolean get() = !channelChanged && old != null && new != null && old.i() != new.i()
}

/**
 * The one shared hook on voice state updates (Discord's `StoreVoiceStates.handleVoiceStateUpdate`) for every
 * voice plugin that reacts to joins, leaves, moves or mute changes. Listeners run on the store thread, right after
 * the store applied the update, so [Voice.liveStatesIn] already reflects it. Keep them quick and post UI work to
 * the main thread. Owners must call [unregisterAll] when they stop.
 */
internal object VoiceEvents {
    private class Listener(val owner: String, val callback: (VoiceChange) -> Unit)

    private val logger = Logger("VoiceEvents")
    private val listeners = CopyOnWriteArrayList<Listener>()
    private var patched = false
    private val pendingOld = ThreadLocal<VoiceState?>()

    fun register(owner: String, callback: (VoiceChange) -> Unit) {
        listeners += Listener(owner, callback)
        ensurePatched()
    }

    fun unregisterAll(owner: String) {
        listeners.removeAll { it.owner == owner }
    }

    private fun lookup(guildId: Long, userId: Long): VoiceState? =
        StoreStream.getVoiceStates().`getInternal$app_productionGoogleRelease`()[guildId]?.get(userId)

    @Synchronized
    private fun ensurePatched() {
        if (patched) return
        patched = true
        try {
            val method = StoreVoiceStates::class.java.getDeclaredMethod("handleVoiceStateUpdate", VoiceState::class.java)
            PatcherAPI(logger).patch(method, object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam) {
                    if (listeners.isEmpty()) return
                    try {
                        val state = param.args[0] as VoiceState
                        pendingOld.set(lookup(state.c(), state.m()))
                    } catch (e: Throwable) {
                        logger.error("Failed to read the previous voice state", e)
                    }
                }

                override fun afterHookedMethod(param: MethodHookParam) {
                    if (listeners.isEmpty()) return
                    val old = pendingOld.get()
                    pendingOld.set(null)
                    try {
                        val state = param.args[0] as VoiceState
                        val new = lookup(state.c(), state.m())
                        if (old == null && new == null) return
                        if (old != null && old == new) return
                        dispatch(VoiceChange(state.m(), state.c(), old, new, state))
                    } catch (e: Throwable) {
                        logger.error("Failed to handle a voice state update", e)
                    }
                }
            })
        } catch (e: Throwable) {
            logger.error("Failed to hook voice state updates", e)
        }
    }

    private fun dispatch(change: VoiceChange) {
        for (listener in listeners) {
            try {
                listener.callback(change)
            } catch (e: Throwable) {
                logger.error("${listener.owner}: voice state listener failed", e)
            }
        }
    }
}
