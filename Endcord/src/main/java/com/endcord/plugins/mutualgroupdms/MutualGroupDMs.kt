/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.mutualgroupdms

import android.content.Context
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.aliucord.wrappers.ChannelWrapper.Companion.name
import com.aliucord.wrappers.ChannelWrapper.Companion.recipientIds
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.aliucord.entities.EndcordPlugin
import com.discord.api.channel.Channel
import com.discord.stores.StoreChannels
import com.discord.stores.StoreStream
import com.discord.utilities.channel.ChannelSelector
import com.endcord.plugins.api.UserSheetActions
import com.endcord.plugins.commandscommon.Dialogs
import com.endcord.plugins.userscommon.Users
import com.lytefast.flexinput.R

internal class MutualGroupDMs : EndcordPlugin(
    name = "MutualGroupDMs",
    description = "Shows mutual group dms in profiles",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("friends", "profiles")

    override fun start(context: Context) {
        UserSheetActions.register(
            name,
            "Mutual Groups",
            R.e.ic_people_white_24dp,
            visible = { !it.state.isMe && !it.user.isBot && mutualGroups(it.user.id).isNotEmpty() },
        ) { ctx ->
            val activity = ctx.sheet.activity ?: return@register
            val groups = mutualGroups(ctx.user.id)
            val labels = groups.map { channel ->
                val members = channel.recipientIds.size + 1
                "${groupName(channel)} ($members ${I18n.t("Members")})"
            }
            Dialogs.showList(activity, I18n.t("Mutual Groups") + " (${groups.size})", labels) { index ->
                ChannelSelector.getInstance().findAndSet(activity, groups[index].id)
            }
        }
    }

    /** Group DMs you share with [userId], most recently active first. */
    private fun mutualGroups(userId: Long): List<Channel> {
        val channels = StoreStream.getChannels().getChannelsForGuild(StoreChannels.PRIVATE_CHANNELS_ID)?.values
            ?: return emptyList()
        return channels
            .filter { it.type == Channel.GROUP_DM && it.recipientIds.contains(userId) }
            .sortedByDescending { lastActivity(it) }
    }

    private fun lastActivity(channel: Channel): Long = try {
        StoreStream.getMessagesMostRecent().mostRecentIds[channel.id] ?: channel.id
    } catch (_: Throwable) {
        channel.id
    }

    private fun groupName(channel: Channel): String {
        val name = channel.name
        if (name.isNotBlank()) return name
        return channel.recipientIds.joinToString(", ") { Users.displayName(it) }
    }
}
