/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.voicejoinmessages

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.endcord.plugins.commandscommon.BotMessages
import com.endcord.plugins.voicecommon.Voice
import com.endcord.plugins.voicecommon.VoiceChange
import com.endcord.plugins.voicecommon.VoiceEvents

internal class VoiceJoinMessages : EndcordPlugin(
    name = "VoiceJoinMessages",
    description = "Receive client-side ephemeral messages when your friends join voice channels",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("voice", "servers", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            "friendDirectMessages",
            "Receive notifications in your friends' DMs when they join a voice channel",
            default = true,
        ),
        PluginSetting.Switch(
            "friendDirectMessagesShowMembers",
            "Show a list of other members in the voice channel when receiving a DM notification of your friend joining a voice channel",
            default = true,
        ),
        PluginSetting.Switch(
            "friendDirectMessagesShowMemberCount",
            "Show the count of other members in the voice channel when receiving a DM notification of your friend joining a voice channel",
        ),
        PluginSetting.Switch(
            "friendDirectMessagesSelf",
            "Receive notifications in your friends' DMs even if you are in the same voice channel as them",
        ),
        PluginSetting.Text(
            "allowedFriends",
            "Comma or space separated list of friends' user IDs you want to recieve join messages from",
        ),
        PluginSetting.Text(
            "ignoredFriends",
            "Comma or space separated list of friends' user IDs you do NOT want to recieve join messages from",
        ),
        PluginSetting.Switch(
            "ignoreBlockedUsers",
            "Do not send messages about blocked users joining/leaving/moving voice channels",
            default = true,
        ),
    )

    private fun ids(key: String): List<String> = string(key).split(',', ' ', '\n').map { it.trim() }.filter { it.isNotEmpty() }

    private fun isFriendAllowlisted(friendId: Long): Boolean {
        if (!Voice.isFriend(friendId)) return false
        val id = friendId.toString()
        if (id in ids("ignoredFriends")) return false
        val allow = ids("allowedFriends")
        return allow.isEmpty() || id in allow
    }

    /** Port of the VOICE_STATE_UPDATES handler. Store thread. */
    private fun onVoiceChange(change: VoiceChange) {
        if (!bool("friendDirectMessages") || change.isMe || !change.isJoin) return
        val userId = change.userId
        if (bool("ignoreBlockedUsers") && Voice.isBlocked(userId)) return
        if (!isFriendAllowlisted(userId)) return

        val channelId = change.newChannelId ?: return
        val channel = Voice.channel(channelId) ?: return
        if (!Voice.can(channel, Voice.PERM_VIEW_CHANNEL)) return

        val selfInChannel = Voice.myChannelId() == channelId
        if (selfInChannel && !bool("friendDirectMessagesSelf")) return
        val dmChannelId = Voice.dmChannelId(userId) ?: return

        val showMembers = bool("friendDirectMessagesShowMembers")
        val showCount = bool("friendDirectMessagesShowMemberCount")
        var members = ""
        if (showMembers || showCount) {
            val others = Voice.liveStatesIn(channelId).map { it.m() }.filter { it != userId }.distinct()
            if (others.isEmpty()) {
                members = I18n.t(", nobody else is in the voice channel")
            } else {
                if (showCount) members += I18n.t(" with {count} other members", "count" to others.size)
                if (showMembers) {
                    val mentions = humanFriendlyJoin(others.map { "<@$it>" })
                    members += if (showCount) ", $mentions" else I18n.t(" with {members}", "members" to mentions)
                }
            }
        }
        BotMessages.send(dmChannelId, I18n.t("Joined voice channel {channel}", "channel" to "<#$channelId>") + members)
    }

    /** "a", "a and b", "a, b and c". */
    private fun humanFriendlyJoin(items: List<String>): String = when (items.size) {
        0 -> ""
        1 -> items[0]
        else -> items.dropLast(1).joinToString(", ") + I18n.t(" and ") + items.last()
    }

    override fun start(context: Context) {
        VoiceEvents.register(name, ::onVoiceChange)
    }

    override fun stop(context: Context) {
        super.stop(context)
        VoiceEvents.unregisterAll(name)
    }
}
