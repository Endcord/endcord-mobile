/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.antimovedeco

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.patcher.before
import com.discord.stores.StoreRtcConnection
import com.discord.stores.StoreVoiceChannelSelected
import com.endcord.plugins.voicecommon.CallIndicator
import com.endcord.plugins.voicecommon.CallSettingsEntries
import com.endcord.plugins.voicecommon.Voice
import com.endcord.plugins.voicecommon.VoiceEvents

internal class AntiMoveDeco : EndcordPlugin(
    name = "AntiMoveDeco",
    description = "Adds a switch to the call settings sheet to prevent being moved or disconnected from a voice channel.",
    authors = arrayOf("vpg"),
) {
    override val tags = listOf("voice")

    /** The protected channel, 0 while off. */
    @Volatile
    private var targetChannelId = 0L

    /** Set while this plugin itself joins, so its own join isn't taken for the user switching channels. */
    @Volatile
    private var rejoining = false

    @Volatile
    private var fatalClose = false

    private val attempts = ArrayList<Long>()

    private fun setProtected(channelId: Long, toast: String?) {
        targetChannelId = channelId
        synchronized(attempts) { attempts.clear() }
        Utils.mainThread.post { CallIndicator.refresh() }
        toast?.let { Utils.showToast(it) }
    }

    private fun rejoin() {
        val target = targetChannelId
        if (target == 0L) return
        val now = System.currentTimeMillis()
        val tooMany = synchronized(attempts) {
            attempts.removeAll { now - it > ATTEMPT_WINDOW_MS }
            attempts += now
            attempts.size > MAX_ATTEMPTS
        }
        if (tooMany) {
            setProtected(0L, I18n.t("AntiMoveDeco turned off: could not get back into the channel"))
            return
        }
        Utils.mainThread.postDelayed({
            if (targetChannelId != target || Voice.myChannelId() == target) return@postDelayed
            rejoining = true
            try {
                Voice.join(target) { result ->
                    Voice.joinFailure(result)?.let { Utils.showToast(it) }
                }
            } finally {
                rejoining = false
            }
        }, REJOIN_DELAY_MS)
    }

    override fun start(context: Context) {
        CallSettingsEntries.registerSwitch(
            name,
            "Prevent being moved or disconnected",
            "Rejoins this channel when someone moves or disconnects you",
            checked = { targetChannelId != 0L && targetChannelId == Voice.myChannelId() },
        ) { _, value ->
            val mine = Voice.myChannelId()
            if (value && mine != 0L) {
                setProtected(mine, I18n.t("AntiMoveDeco on: protecting {channel}", "channel" to Voice.channelName(mine)))
            } else {
                setProtected(0L, I18n.t("AntiMoveDeco off"))
            }
        }
        CallIndicator.register(name) {
            if (targetChannelId != 0L && targetChannelId == Voice.myChannelId()) I18n.t("Protected") else null
        }

        // Being disconnected by a moderator closes the voice connection, and the app then clears the channel
        // itself: that clear must not count as the user leaving
        patcher.before<StoreRtcConnection>("onFatalClose") { fatalClose = true }
        patcher.after<StoreRtcConnection>("onFatalClose") { fatalClose = false }

        // Leaving or switching channels yourself ends or moves the protection instead of fighting it
        patcher.before<StoreVoiceChannelSelected>("clear") {
            if (targetChannelId == 0L || rejoining) return@before
            if (fatalClose) {
                val target = targetChannelId
                Utils.mainThread.post { if (targetChannelId == target) rejoin() }
            } else {
                setProtected(0L, I18n.t("AntiMoveDeco off"))
            }
        }
        patcher.before<StoreVoiceChannelSelected>("selectVoiceChannel", Long::class.javaPrimitiveType!!) { param ->
            val target = targetChannelId
            val channelId = param.args[0] as Long
            if (target != 0L && !rejoining && channelId != target) setProtected(channelId, null)
        }

        VoiceEvents.register(name) { change ->
            val target = targetChannelId
            if (target == 0L || !change.isMe || !change.channelChanged) return@register
            // Your state elsewhere (another device) doesn't count; only what this client lost
            if (change.oldChannelId == target && change.newChannelId != target) rejoin()
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        CallSettingsEntries.unregisterAll(name)
        CallIndicator.unregisterAll(name)
        VoiceEvents.unregisterAll(name)
        targetChannelId = 0L
    }

    private companion object {
        const val REJOIN_DELAY_MS = 500L
        /** A disconnect can report twice (voice state and connection close), so this is about three disconnects. */
        const val MAX_ATTEMPTS = 6
        const val ATTEMPT_WINDOW_MS = 30_000L
    }
}
