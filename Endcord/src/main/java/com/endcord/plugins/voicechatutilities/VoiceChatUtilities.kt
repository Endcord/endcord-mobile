/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.voicechatutilities

import android.content.Context
import androidx.appcompat.app.AlertDialog
import com.aliucord.Http
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.aliucord.wrappers.ChannelWrapper.Companion.name
import com.aliucord.wrappers.ChannelWrapper.Companion.position
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.discord.api.channel.Channel
import com.discord.stores.StoreStream
import com.endcord.plugins.commandscommon.Dialogs
import com.endcord.plugins.voicecommon.CallSettingsEntries
import com.endcord.plugins.voicecommon.Voice
import org.json.JSONObject

internal class VoiceChatUtilities : EndcordPlugin(
    name = "VoiceChatUtilities",
    description = "This plugin allows you to perform multiple actions on an entire channel (move, mute, disconnect, etc.) (originally by dutake)",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("voice", "servers", "chat")

    override val settingsSchema = listOf(
        PluginSetting.Number(
            "waitAfter",
            "Amount of API actions to perform before waiting (to avoid rate limits)",
            default = 5,
            min = 1,
            max = 20,
        ),
        PluginSetting.Number("waitSeconds", "Time to wait between each action (in seconds)", default = 2, min = 1, max = 10),
    )

    private class Action(val label: String, val permission: Long, val run: (Channel) -> Unit)

    @Volatile
    private var running = false

    private fun isVoice(channel: Channel) = channel.type == Voice.TYPE_VOICE || channel.type == Voice.TYPE_STAGE

    private fun actions(channel: Channel): List<Action> = listOf(
        Action("Disconnect all", Voice.PERM_MOVE_MEMBERS) { confirm(it, "Disconnect all", JSONObject().put("channel_id", JSONObject.NULL), false) },
        Action("Mute all", Voice.PERM_MUTE_MEMBERS) { confirm(it, "Mute all", JSONObject().put("mute", true), false) },
        Action("Unmute all", Voice.PERM_MUTE_MEMBERS) { confirm(it, "Unmute all", JSONObject().put("mute", false), false) },
        Action("Deafen all", Voice.PERM_DEAFEN_MEMBERS) { confirm(it, "Deafen all", JSONObject().put("deaf", true), false) },
        Action("Undeafen all", Voice.PERM_DEAFEN_MEMBERS) { confirm(it, "Undeafen all", JSONObject().put("deaf", false), false) },
        Action("Move all", Voice.PERM_MOVE_MEMBERS) { pickTarget(it) },
        Action("Copy mentions of all users", 0L) { copyMentions(it) },
    ).filter { it.permission == 0L || Voice.can(channel, it.permission) }

    private fun others(channel: Channel, includeMe: Boolean): List<Long> {
        val me = Voice.myId()
        return Voice.statesIn(channel.id).map { it.m() }.filter { includeMe || it != me }.distinct()
    }

    private fun showTools(channel: Channel) {
        val activity = Voice.activity() ?: return
        val available = actions(channel)
        Dialogs.showList(activity, I18n.t("Voice Tools"), available.map { I18n.t(it.label) }) { index ->
            available[index].run(channel)
        }
    }

    /** Asks before acting on everyone, every time: these actions affect other people. */
    private fun confirm(channel: Channel, label: String, body: JSONObject, includeMe: Boolean, target: Channel? = null) {
        val users = others(channel, includeMe)
        if (users.isEmpty()) {
            Utils.showToast(I18n.t("Nobody else is in this channel"))
            return
        }
        val activity = Voice.activity() ?: return
        val message = if (target != null) {
            I18n.t("Move {count} users from {from} to {to}?", "count" to users.size, "from" to channel.name, "to" to target.name)
        } else {
            I18n.t("{action}: {count} users in {channel}?", "action" to I18n.t(label), "count" to users.size, "channel" to channel.name)
        }
        AlertDialog.Builder(activity)
            .setTitle(I18n.t(label))
            .setMessage(message)
            .setPositiveButton(I18n.t("Confirm")) { _, _ -> run(channel.guildId, users, body) }
            .setNegativeButton(I18n.t("Cancel"), null)
            .show()
    }

    private fun pickTarget(channel: Channel) {
        val activity = Voice.activity() ?: return
        val targets = StoreStream.getChannels().getChannelsForGuild(channel.guildId).values
            .filter { it.id != channel.id && isVoice(it) && Voice.can(it, Voice.PERM_CONNECT) }
            .sortedBy { it.position }
        if (targets.isEmpty()) {
            Utils.showToast(I18n.t("No other voice channel to move to"))
            return
        }
        Dialogs.showList(activity, I18n.t("Move all"), targets.map { it.name }) { index ->
            val target = targets[index]
            // PC moves you too
            confirm(channel, "Move all", JSONObject().put("channel_id", target.id.toString()), true, target)
        }
    }

    private fun copyMentions(channel: Channel) {
        val users = others(channel, false)
        if (users.isEmpty()) {
            Utils.showToast(I18n.t("Nobody else is in this channel"))
            return
        }
        Dialogs.copy(users.joinToString(" ") { "<@$it>" } + " ")
    }

    /** Port of sendPatch + runSequential: one member update after another, pausing to stay under rate limits. */
    private fun run(guildId: Long, users: List<Long>, body: JSONObject) {
        if (running) {
            Utils.showToast(I18n.t("Another voice action is still running"))
            return
        }
        running = true
        val json = body.toString()
        val waitAfter = int("waitAfter").coerceIn(1, 20)
        val waitMs = int("waitSeconds").coerceIn(1, 10) * 1000L
        Utils.threadPool.execute {
            var failed = 0
            try {
                users.forEachIndexed { index, userId ->
                    try {
                        val request = Http.Request.newDiscordRNRequest("/guilds/$guildId/members/$userId", "PATCH")
                        try {
                            request.setHeader("Content-Type", "application/json").executeWithBody(json).assertOk()
                        } finally {
                            request.close()
                        }
                    } catch (e: Throwable) {
                        failed++
                        logger.error("Failed to update member $userId", e)
                    }
                    if (index % waitAfter == 0 && index != users.size - 1) Thread.sleep(waitMs)
                }
            } finally {
                running = false
            }
            Utils.showToast(
                if (failed == 0) I18n.t("Done: {count} users", "count" to users.size)
                else I18n.t("{failed} of {count} users could not be updated", "failed" to failed, "count" to users.size),
            )
        }
    }

    override fun start(context: Context) {
        CallSettingsEntries.registerButton(
            name,
            "Voice Tools",
            visible = { channel -> isVoice(channel) && !Voice.isPrivate(channel) && Voice.statesIn(channel.id).size > 1 },
        ) { channel, sheet ->
            try {
                sheet.dismiss()
            } catch (_: Throwable) {
            }
            showTools(channel)
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        CallSettingsEntries.unregisterAll(name)
    }
}
