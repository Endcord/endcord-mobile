/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.quickmention

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.discord.api.permission.Permission
import com.discord.models.user.CoreUser
import com.discord.stores.StoreStream
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R

internal class QuickMention : EndcordPlugin(
    name = "QuickMention",
    description = "Adds a quick mention button to the message actions bar",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "shortcuts")

    override fun start(context: Context) {
        MessageActions.register(
            name,
            "Quick Mention",
            R.e.ic_mentions_white_24dp,
            visible = { ctx ->
                val author = ctx.message.author
                val permissions = ctx.model.permissions
                val inGuild = (ctx.model.channel?.guildId ?: 0L) != 0L
                author != null && !ctx.message.isLocal &&
                    (!inGuild || permissions == null || permissions and Permission.SEND_MESSAGES != 0L)
            },
        ) { ctx ->
            val author = ctx.message.author ?: return@register
            // Same path as Discord's own "mention" shortcuts: the chat input turns it into a real mention
            StoreStream.getChat().appendMention(CoreUser(author), ctx.model.channel?.guildId ?: 0L)
        }
    }
}
