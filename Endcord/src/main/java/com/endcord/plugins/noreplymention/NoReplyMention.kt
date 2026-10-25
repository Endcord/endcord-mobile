/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.noreplymention

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.before
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.discord.api.channel.Channel
import com.discord.models.message.Message
import com.discord.stores.StorePendingReplies
import com.discord.stores.StoreStream
import com.endcord.plugins.composercommon.ComposerUtils

internal class NoReplyMention : EndcordPlugin(
    name = "NoReplyMention",
    description = "Disables reply pings by default",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "notifications")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            key = "userList",
            label = "List of user ids to allow or exempt pings for (separated by commas or spaces)",
            multiline = true,
        ),
        PluginSetting.Text(
            key = "roleList",
            label = "List of role ids to allow or exempt pings for (separated by commas or spaces)",
            multiline = true,
        ),
        PluginSetting.Choice(
            key = "shouldPingListed",
            label = "Behaviour",
            options = listOf(
                PluginSetting.Choice.Option("true", "Only ping the listed users / roles"),
                PluginSetting.Choice.Option("false", "Do not ping the listed users / roles"),
            ),
        ),
    )

    override fun start(context: Context) {
        // Every way of starting a reply (long-press menu, swipe) goes through here. The mention toggle in the
        // reply bar still works afterwards.
        patcher.before<StorePendingReplies>(
            "onCreatePendingReply",
            Channel::class.java,
            Message::class.java,
            Boolean::class.javaPrimitiveType!!,
            Boolean::class.javaPrimitiveType!!,
        ) { param ->
            val channel = param.args[0] as? Channel ?: return@before
            val message = param.args[1] as? Message ?: return@before
            if (ComposerUtils.authorId(message) == ComposerUtils.myId()) return@before
            param.args[2] = shouldMention(channel, message)
        }
    }

    private fun shouldMention(channel: Channel, message: Message): Boolean {
        val authorId = ComposerUtils.authorId(message)
        val users = ids("userList")
        var isListed = authorId in users

        val guildId = channel.guildId
        if (!isListed && guildId != 0L) {
            val roles = ids("roleList")
            if (roles.isNotEmpty()) {
                val member = StoreStream.getGuilds().members[guildId]?.get(authorId)
                isListed = member?.roles?.any { it in roles } == true
            }
        }

        return if (choice("shouldPingListed") == "false") !isListed else isListed
    }

    private fun ids(key: String): Set<Long> =
        string(key).split(',', ' ', '\n', '\t').mapNotNull { it.trim().toLongOrNull() }.toSet()
}
