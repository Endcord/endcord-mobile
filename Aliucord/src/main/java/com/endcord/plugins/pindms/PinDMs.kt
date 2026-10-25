/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.pindms

import android.content.Context
import com.aliucord.entities.PluginSetting
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.aliucord.wrappers.ChannelWrapper.Companion.isDM
import com.discord.stores.StoreStream
import com.discord.widgets.channels.list.items.ChannelListItem
import com.discord.widgets.channels.list.items.ChannelListItemPrivate
import com.endcord.plugins.api.ChannelSheetActions
import com.endcord.plugins.guildscommon.ChannelListHooks
import com.endcord.plugins.guildscommon.GuildsPlugin
import com.lytefast.flexinput.R

internal class PinDMs : GuildsPlugin(
    name = "PinDMs",
    description = "Allows you to pin private channels to the top of your DM list. To pin/unpin or re-order pins, long-press DMs",
) {
    override val tags = listOf("chat", "organisation")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            key = "pinOrder",
            label = "Which order should pinned DMs be displayed in?",
            options = listOf(
                PluginSetting.Choice.Option("recent", "Most recent message"),
                PluginSetting.Choice.Option("custom", "Custom (long-press DMs to reorder)"),
            ),
        ),
        PluginSetting.Action("unpinAll", "Unpin all DMs", "Remove every pinned direct message") {
            saveIds(KEY, emptyList())
            ChannelListHooks.refresh()
        },
    )

    override fun load(context: Context) {
        super.load(context)
        ChannelListHooks.prepare()
    }

    override fun onSettingChanged(key: String) {
        ChannelListHooks.refresh()
    }

    override fun start(context: Context) {
        ChannelListHooks.register(name, object : ChannelListHooks.Transformer {
            override fun privateList(items: MutableList<ChannelListItem>) {
                val pins = ids(KEY)
                if (pins.isEmpty()) return
                val pinned = items.filter { it is ChannelListItemPrivate && it.channel.id in pins }
                if (pinned.isEmpty()) return
                val first = items.indexOfFirst { it is ChannelListItemPrivate }
                items.removeAll(pinned)
                val ordered = if (choice("pinOrder") == "custom") {
                    pinned.sortedBy { pins.indexOf((it as ChannelListItemPrivate).channel.id) }
                } else {
                    val recent = StoreStream.getMessagesMostRecent().mostRecentIds
                    pinned.sortedByDescending { recent[(it as ChannelListItemPrivate).channel.id] ?: 0L }
                }
                items.addAll(first.coerceIn(0, items.size), ordered)
            }
        })

        fun pinned(id: Long) = id in ids(KEY)
        ChannelSheetActions.register(name, "Pin DM", R.e.ic_pin_24dp, { it.channel.isDM() && !pinned(it.channel.id) }) {
            saveIds(KEY, ids(KEY).apply { add(it.channel.id) })
            ChannelListHooks.refresh()
        }
        ChannelSheetActions.register(name, "Unpin DM", R.e.ic_pin_24dp, { it.channel.isDM() && pinned(it.channel.id) }) {
            saveIds(KEY, ids(KEY).apply { remove(it.channel.id) })
            ChannelListHooks.refresh()
        }
        ChannelSheetActions.register(name, "Move Up", R.e.ic_arrow_up_24dp, { canMove(it.channel.id, -1) }) {
            move(it.channel.id, -1)
        }
        ChannelSheetActions.register(name, "Move Down", R.e.ic_arrow_down_24dp, { canMove(it.channel.id, 1) }) {
            move(it.channel.id, 1)
        }
        ChannelListHooks.refresh()
    }

    override fun stop(context: Context) {
        super.stop(context)
        ChannelListHooks.refresh()
    }

    private fun canMove(id: Long, by: Int): Boolean {
        if (choice("pinOrder") != "custom") return false
        val pins = ids(KEY)
        val index = pins.indexOf(id)
        return index >= 0 && index + by >= 0 && index + by < pins.size
    }

    private fun move(id: Long, by: Int) {
        val pins = ids(KEY)
        val index = pins.indexOf(id)
        if (index < 0 || index + by < 0 || index + by >= pins.size) return
        pins.removeAt(index)
        pins.add(index + by, id)
        saveIds(KEY, pins)
        ChannelListHooks.refresh()
    }

    private companion object {
        const val KEY = "pinnedDms"
    }
}
