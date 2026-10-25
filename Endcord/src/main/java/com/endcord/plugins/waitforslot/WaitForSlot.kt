/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.waitforslot

import android.content.Context
import androidx.appcompat.app.AlertDialog
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.aliucord.wrappers.ChannelWrapper.Companion.userLimit
import com.discord.stores.StoreVoiceChannelSelected
import com.endcord.plugins.voicecommon.Sounds
import com.endcord.plugins.voicecommon.Voice
import com.endcord.plugins.voicecommon.VoiceEvents

internal class WaitForSlot : EndcordPlugin(
    name = "WaitForSlot",
    description = "Automatically join a full voice channel when a slot opens.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("voice", "servers", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch("autoJoin", "Join the channel immediately instead of showing a notice."),
        PluginSetting.Switch("notificationSound", "Play a sound when a slot becomes available.", default = true),
        PluginSetting.Action("leaveQueue", "Leave Queue") { leaveQueue() },
    )

    @Volatile
    private var waitingChannelId = 0L

    private fun leaveQueue() {
        if (waitingChannelId == 0L) {
            Utils.showToast(I18n.t("You are not waiting for a voice channel"))
            return
        }
        waitingChannelId = 0L
        Utils.showToast(I18n.t("Left the queue"))
    }

    /** Port of promptVoiceChannel: Discord refused the join because the channel is full. Main thread. */
    private fun promptFull(channelId: Long) {
        val channel = Voice.channel(channelId) ?: return
        if (channel.type != Voice.TYPE_VOICE || channel.userLimit <= 0) return
        if (Voice.can(channel, Voice.PERM_MOVE_MEMBERS)) return
        val activity = Voice.activity() ?: return
        val name = Voice.channelName(channelId)

        if (waitingChannelId == channelId) {
            AlertDialog.Builder(activity)
                .setMessage(I18n.t("You are waiting for a slot in {channel}.", "channel" to name))
                .setPositiveButton(I18n.t("Keep waiting"), null)
                .setNegativeButton(I18n.t("Leave Queue")) { _, _ -> leaveQueue() }
                .show()
            return
        }
        AlertDialog.Builder(activity)
            .setMessage(I18n.t("Voice channel {channel} is full. Wait for a slot?", "channel" to name))
            .setPositiveButton(I18n.t("Wait")) { _, _ ->
                waitingChannelId = channelId
                Utils.showToast(I18n.t("Joined the queue for {channel}", "channel" to name))
            }
            .setNegativeButton(I18n.t("Cancel"), null)
            .show()
    }

    /** Port of the VOICE_STATE_UPDATES handler. Store thread. */
    private fun checkSlot() {
        val channelId = waitingChannelId
        if (channelId == 0L) return
        val channel = Voice.channel(channelId)
        if (channel == null || channel.userLimit <= 0) {
            waitingChannelId = 0L
            return
        }
        if (Voice.liveStatesIn(channelId).size >= channel.userLimit) return
        waitingChannelId = 0L

        Utils.mainThread.post {
            if (bool("notificationSound")) Sounds.notification(Utils.appContext)
            val name = Voice.channelName(channelId)
            if (bool("autoJoin")) {
                Voice.join(channelId) { result -> Voice.joinFailure(result)?.let { Utils.showToast(it) } }
                return@post
            }
            val activity = Voice.activity()
            if (activity == null) {
                Utils.showToast(I18n.t("Hey, someone just left {channel} and there's a spot for you now!", "channel" to name), true)
                return@post
            }
            AlertDialog.Builder(activity)
                .setMessage(I18n.t("Hey, someone just left {channel} and there's a spot for you now!", "channel" to name))
                .setPositiveButton(I18n.t("Join")) { _, _ ->
                    Voice.join(channelId) { result -> Voice.joinFailure(result)?.let { Utils.showToast(it) } }
                }
                .setNegativeButton(I18n.t("Cancel"), null)
                .show()
        }
    }

    override fun start(context: Context) {
        // Every join goes through selectVoiceChannelInternal; a full channel comes back as FAILED_CHANNEL_FULL
        patcher.after<StoreVoiceChannelSelected>(
            "selectVoiceChannelInternal",
            Long::class.javaPrimitiveType!!,
            Boolean::class.javaPrimitiveType!!,
        ) { param ->
            try {
                if (param.result == StoreVoiceChannelSelected.JoinVoiceChannelResult.FAILED_CHANNEL_FULL) {
                    val channelId = param.args[0] as Long
                    Utils.mainThread.post { promptFull(channelId) }
                }
            } catch (e: Throwable) {
                logger.error("Failed to offer the queue", e)
            }
        }
        VoiceEvents.register(name) { change ->
            val waiting = waitingChannelId
            if (waiting != 0L && change.touches(waiting) && change.channelChanged) checkSlot()
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        VoiceEvents.unregisterAll(name)
        waitingChannelId = 0L
    }
}
