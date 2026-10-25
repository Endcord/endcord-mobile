/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.onefa

import android.content.Context
import com.discord.widgets.channels.list.items.ChannelListItem
import com.discord.widgets.channels.list.items.ChannelListItemMfaNotice
import com.endcord.plugins.guildsbcommon.GuildsBPlugin
import com.endcord.plugins.guildscommon.ChannelListHooks

/**
 * On Android the two-factor warning for moderators is a row at the top of the server's channel list
 * ([ChannelListItemMfaNotice]); it is taken out of the list right after Discord built it.
 */
internal class OneFA : GuildsBPlugin(
    name = "1FA",
    description = "Hides the warning that asks moderators to enable two-factor authentication",
) {
    override val tags = listOf("privacy", "utility")

    override fun start(context: Context) {
        ChannelListHooks.register(name, object : ChannelListHooks.Transformer {
            override fun guildList(guildId: Long, items: MutableList<ChannelListItem>) {
                items.removeAll { it is ChannelListItemMfaNotice }
            }
        })
        ChannelListHooks.refresh()
    }

    override fun stop(context: Context) {
        super.stop(context)
        ChannelListHooks.refresh()
    }
}
