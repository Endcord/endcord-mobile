/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.atsomeone

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.ChannelWrapper.Companion.recipientIds
import com.discord.stores.StoreStream
import com.endcord.plugins.api.OutgoingMessages
import com.endcord.plugins.api.SendHooks
import com.endcord.plugins.commandscommon.Patterns
import java.util.regex.Pattern

internal class AtSomeone : EndcordPlugin(
    name = "AtSomeone",
    description = "Mention a random member of the channel",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "fun")

    // Not inside words, so addresses like name@someone.com are left alone
    private val someone = Pattern.compile("(?<![\\w@])@someone(?!\\w)")

    override fun start(context: Context) {
        SendHooks.register(name, onEdit = true, priority = OutgoingMessages.Priority.EXPAND) { text ->
            if (!text.contains("@someone")) text
            else Patterns.replace(someone, text) { match -> randomUser()?.let { "<@$it>" } ?: match.group() }
        }
    }

    override fun stop(context: Context) {
        SendHooks.unregisterAll(name)
        super.stop(context)
    }

    /**
     * A random member of the channel being typed in: a recipient in DMs, a cached member in servers
     * (the same members Endcord PC picks from). Null when nobody is known.
     */
    private fun randomUser(): Long? {
        val channel = StoreStream.getChannels().getChannel(StoreStream.getChannelsSelected().id) ?: return null
        val guildId = channel.guildId
        if (guildId == 0L) return channel.recipientIds.takeIf { it.isNotEmpty() }?.random()
        return StoreStream.getGuilds().members[guildId]?.keys?.toList()?.takeIf { it.isNotEmpty() }?.random()
    }
}
