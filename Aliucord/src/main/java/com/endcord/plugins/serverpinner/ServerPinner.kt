/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.serverpinner

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.discord.stores.StoreGuildsSorted
import com.discord.widgets.guilds.list.GuildListItem
import com.endcord.plugins.guildscommon.GuildListHooks
import com.endcord.plugins.guildscommon.GuildMenuActions
import com.endcord.plugins.guildscommon.GuildsPlugin
import com.lytefast.flexinput.R
import java.lang.reflect.Field
import java.util.Collections
import java.util.WeakHashMap

internal class ServerPinner : GuildsPlugin(
    name = "ServerPinner",
    description = "Pin servers to the top of your server list from their long-press menu, without changing your folders.",
) {
    override val tags = listOf("servers", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Action("unpinAll", "Unpin all servers", "Remove every pinned server from the top of the list") {
            saveIds(KEY, emptyList())
            GuildListHooks.refresh()
        },
    )

    /** The rows showing pinned copies; they can't be dragged so Discord never saves them into your folders. */
    private val copies: MutableSet<GuildListItem> = Collections.synchronizedSet(Collections.newSetFromMap(WeakHashMap()))

    override fun load(context: Context) {
        super.load(context)
        GuildListHooks.prepare()
    }

    override fun start(context: Context) {
        GuildListHooks.register(name, object : GuildListHooks.Transformer {
            override fun entries(entries: MutableList<StoreGuildsSorted.Entry>) {
                val pins = ids(KEY)
                if (pins.isEmpty()) return
                val guilds = GuildListHooks.guildsOf(entries).associateBy { it.id }
                val pinned = pins.mapNotNull { guilds[it] }
                entries.addAll(0, pinned.map { StoreGuildsSorted.Entry.SingletonGuild(it) })
            }

            override fun items(items: MutableList<GuildListItem>) {
                val pins = ids(KEY)
                if (pins.isEmpty() || items.any { it in copies }) return
                var last = -1
                for (pin in pins) {
                    val index = items.indexOfFirst {
                        it is GuildListItem.GuildItem && it.guild.id == pin && it.folderId == null && it !in copies
                    }
                    if (index < 0) continue
                    val item = items[index]
                    // the copy is its own object: give it its own row id so it doesn't clash with the original
                    itemId.setLong(item, -pin)
                    copies += item
                    if (index > last) last = index
                }
                if (last >= 0) items.add(last + 1, divider)
            }

            override fun isLocked(item: GuildListItem) = item in copies || item === divider

            override fun beforeSave(entries: MutableList<StoreGuildsSorted.Entry>, saved: List<StoreGuildsSorted.Entry>) {
                // drop the pinned copies: the first of two entries for the same server
                val counts = HashMap<Long, Int>()
                GuildListHooks.guildsOf(entries).forEach { counts[it.id] = (counts[it.id] ?: 0) + 1 }
                val duplicated = counts.filterValues { it > 1 }.keys.toMutableSet()
                if (duplicated.isEmpty()) return
                val removed = HashSet<Long>()
                GuildListHooks.removeGuilds(entries) { guild ->
                    if (guild.id in duplicated && guild.id !in removed) {
                        removed += guild.id
                        true
                    } else {
                        false
                    }
                }
            }
        }, priority = 10)

        GuildMenuActions.register(name, { if (it.id in ids(KEY)) "Unpin server" else "Pin server to top" }, R.e.ic_pin_24dp) { ctx ->
            val pins = ids(KEY)
            if (ctx.guild.id in pins) {
                pins -= ctx.guild.id
                Utils.showToast(I18n.t("Unpinned {server}", "server" to ctx.guild.name))
            } else {
                pins += ctx.guild.id
                Utils.showToast(I18n.t("Pinned {server} to the top of your server list", "server" to ctx.guild.name))
            }
            saveIds(KEY, pins)
            GuildListHooks.refresh()
        }
        GuildListHooks.refresh()
    }

    override fun stop(context: Context) {
        super.stop(context)
        copies.clear()
        GuildListHooks.refresh()
    }

    private companion object {
        const val KEY = "pinnedServers"

        val itemId: Field by lazy { GuildListItem::class.java.getDeclaredField("itemId").apply { isAccessible = true } }

        /** A second divider between the pinned servers and the rest, with a row id of its own. */
        val divider: GuildListItem by lazy {
            GuildListItem.DividerItem::class.java.getDeclaredConstructor().apply { isAccessible = true }.newInstance().also {
                itemId.setLong(it, Long.MIN_VALUE + 11)
            }
        }
    }
}
