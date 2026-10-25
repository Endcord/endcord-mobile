/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.typingindicator

import android.content.Context
import android.widget.TextView
import com.aliucord.entities.PluginSetting
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.discord.databinding.WidgetChannelsListItemChannelBinding
import com.discord.databinding.WidgetChannelsListItemChannelPrivateBinding
import com.discord.widgets.channels.list.items.ChannelListItemPrivate
import com.discord.widgets.channels.list.items.ChannelListItemTextChannel
import com.endcord.plugins.guildsbcommon.GuildsBPlugin
import com.endcord.plugins.guildsbcommon.ThreadRowHooks
import com.endcord.plugins.guildsbcommon.TypingRows
import com.endcord.plugins.guildsbcommon.TypingState
import com.endcord.plugins.guildscommon.ChannelListHooks

/**
 * Animated typing dots after the name of every channel, thread and (optionally) direct message someone is typing in.
 * Rows are updated in place from [TypingState] when typing starts or stops, without rebuilding the list.
 */
internal class TypingIndicator : GuildsBPlugin(
    name = "TypingIndicator",
    description = "Adds an indicator if someone is typing on a channel.",
) {
    override val tags = listOf("notifications", "appearance", "servers")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            "includeCurrentChannel", "Include current channel",
            "Whether to show the typing indicator for the currently selected channel", default = true,
        ),
        PluginSetting.Switch(
            "includeMutedChannels", "Include muted channels",
            "Whether to show the typing indicator for muted channels.",
        ),
        PluginSetting.Switch(
            "includeBlockedUsers", "Include blocked users",
            "Whether to show the typing indicator for blocked users.",
        ),
        PluginSetting.Switch(
            "includeDms", "Include direct messages",
            "Also show the typing indicator in your direct messages list", default = true,
        ),
    )

    private class Row(val channelId: Long, val muted: Boolean, val selected: Boolean, val dm: Boolean)

    private val rows = TypingRows<Row>()

    override fun start(context: Context) {
        ChannelListHooks.registerDecorator(name, object : ChannelListHooks.RowDecorator {
            override fun text(item: ChannelListItemTextChannel, binding: WidgetChannelsListItemChannelBinding) {
                bind(binding.e, Row(item.channel.id, item.muted, item.selected, false))
            }

            override fun private(item: ChannelListItemPrivate, binding: WidgetChannelsListItemChannelPrivateBinding) {
                bind(binding.f, Row(item.channel.id, item.muted, item.selected, true))
            }
        })
        ThreadRowHooks.register(name) { item, binding ->
            bind(binding.d, Row(item.channel.id, item.muted, item.selected, false))
        }
        TypingState.register(name) { typing ->
            rows.forEach { view, row -> update(view, row, typing) }
        }
    }

    override fun onSettingChanged(key: String) {
        val typing = TypingState.current
        rows.forEach { view, row -> update(view, row, typing) }
    }

    private fun bind(view: TextView, row: Row) {
        rows.bind(view, row)
        update(view, row, TypingState.current)
    }

    private fun update(view: TextView, row: Row, typing: Map<Long, Set<Long>>) {
        val visible = typing.containsKey(row.channelId) &&
            (!row.dm || bool("includeDms")) &&
            (!row.selected || bool("includeCurrentChannel")) &&
            (!row.muted || bool("includeMutedChannels")) &&
            TypingState.typingIn(row.channelId, bool("includeBlockedUsers"), typing).isNotEmpty()
        TypingRows.show(view, visible)
    }

    override fun stop(context: Context) {
        super.stop(context)
        rows.clear()
    }
}
