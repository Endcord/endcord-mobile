/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.cleanerchannelgroups

import android.content.Context
import com.discord.widgets.channels.list.items.ChannelListItem
import com.discord.widgets.channels.list.items.ChannelListItemCategory
import com.discord.widgets.channels.list.items.ChannelListItemStageAudienceCount
import com.discord.widgets.channels.list.items.ChannelListItemStageVoiceChannel
import com.discord.widgets.channels.list.items.ChannelListItemTextChannel
import com.discord.widgets.channels.list.items.ChannelListItemThread
import com.discord.widgets.channels.list.items.ChannelListItemVoiceChannel
import com.discord.widgets.channels.list.items.ChannelListItemVoiceUser
import com.endcord.plugins.guildscommon.ChannelListHooks
import com.endcord.plugins.guildscommon.GuildsPlugin

internal class CleanerChannelGroups : GuildsPlugin(
    name = "CleanerChannelGroups",
    description = "Hides all channels in collapsed categories, even if they have unread messages.",
) {
    override val tags = listOf("appearance", "servers")

    override fun load(context: Context) {
        super.load(context)
        ChannelListHooks.prepare()
    }

    override fun start(context: Context) {
        ChannelListHooks.register(name, object : ChannelListHooks.Transformer {
            override fun guildList(guildId: Long, items: MutableList<ChannelListItem>) {
                var collapsed = false
                // The channel that is open stays visible, so the list still shows where you are.
                var keepChildren = false
                val it = items.listIterator()
                while (it.hasNext()) {
                    val item = it.next()
                    if (item is ChannelListItemCategory) {
                        collapsed = item.isCollapsed
                        continue
                    }
                    if (!collapsed) continue
                    when (item) {
                        is ChannelListItemTextChannel -> {
                            keepChildren = item.selected
                            if (!keepChildren) it.remove()
                        }
                        is ChannelListItemVoiceChannel -> {
                            keepChildren = item.textSelected || item.voiceSelected
                            if (!keepChildren) it.remove()
                        }
                        is ChannelListItemStageVoiceChannel -> {
                            keepChildren = false
                            it.remove()
                        }
                        is ChannelListItemThread, is ChannelListItemVoiceUser, is ChannelListItemStageAudienceCount ->
                            if (!keepChildren) it.remove()
                    }
                }
            }
        })
        ChannelListHooks.refresh()
    }

    override fun stop(context: Context) {
        super.stop(context)
        ChannelListHooks.refresh()
    }
}
