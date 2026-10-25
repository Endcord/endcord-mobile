/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.guildscommon

import androidx.recyclerview.widget.RecyclerView
import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.api.PatcherAPI
import com.aliucord.patcher.after
import com.aliucord.patcher.before
import com.discord.models.guild.Guild
import com.discord.stores.StoreGuildsSorted
import com.discord.widgets.guilds.list.GuildListItem
import com.discord.widgets.guilds.list.GuildListViewHolder
import com.discord.widgets.guilds.list.WidgetGuildListAdapter
import com.discord.widgets.guilds.list.WidgetGuildsListViewModel
import java.lang.ref.WeakReference
import java.lang.reflect.Field
import java.lang.reflect.Method
import java.util.concurrent.CopyOnWriteArrayList

/**
 * One set of hooks on the server list shared by the plugins of this batch. Plugins change the list Discord
 * builds the rows from (servers and folders), the rows themselves, and fix up the order Discord saves after
 * the user dragged a server, so hidden servers and pinned copies never end up in the user's saved folders.
 */
internal object GuildListHooks {
    interface Transformer {
        /** Changes the server list entries (servers and folders) before Discord turns them into rows. */
        fun entries(entries: MutableList<StoreGuildsSorted.Entry>) {}

        /** Changes the rows of the server list. May run more than once for the same list: stay idempotent. */
        fun items(items: MutableList<GuildListItem>) {}

        /** Whether a row must not be dragged or used as a drop target. */
        fun isLocked(item: GuildListItem): Boolean = false

        /**
         * Fixes [entries], the order Discord is about to save after the user dragged a server. [saved] is the order
         * saved so far, without any plugin changes.
         */
        fun beforeSave(entries: MutableList<StoreGuildsSorted.Entry>, saved: List<StoreGuildsSorted.Entry>) {}
    }

    private class Reg(val owner: String, val priority: Int, val value: Transformer)

    private val logger = Logger("GuildListHooks")
    private val patcher = PatcherAPI(logger)
    private val transformers = CopyOnWriteArrayList<Reg>()
    private var patched = false

    private val inHandle = ThreadLocal<Boolean>()
    @Volatile private var dropping = false
    @Volatile private var viewModel: WeakReference<WidgetGuildsListViewModel>? = null
    @Volatile private var lastState: WidgetGuildsListViewModel.StoreState? = null

    private val handleStoreState: Method by lazy {
        WidgetGuildsListViewModel::class.java
            .getDeclaredMethod("handleStoreState", WidgetGuildsListViewModel.StoreState::class.java)
            .apply { isAccessible = true }
    }

    // StoreState.copy$default(state, 23 values, mask, marker): bit 8 is sortedGuilds (component9)
    private val copyState: Method by lazy {
        val cls = WidgetGuildsListViewModel.StoreState::class.java
        cls.declaredMethods.first { it.name == "copy\$default" }.apply { isAccessible = true }
    }

    private val holderData: Field by lazy {
        GuildListViewHolder.GuildViewHolder::class.java.getDeclaredField("data").apply { isAccessible = true }
    }

    /**
     * Hooks the list early, before any plugin registered, so the list shown right now can be rebuilt with
     * [refresh] as soon as a plugin is turned on.
     */
    @JvmStatic
    fun prepare() {
        try {
            ensurePatched()
        } catch (e: Throwable) {
            logger.error("Failed to hook the list", e)
        }
    }

    @JvmStatic
    fun register(owner: String, transformer: Transformer, priority: Int = 0) {
        synchronized(transformers) {
            val reg = Reg(owner, priority, transformer)
            val index = transformers.indexOfFirst { it.priority > priority }
            if (index < 0) transformers.add(reg) else transformers.add(index, reg)
        }
        ensurePatched()
    }

    @JvmStatic
    fun unregisterAll(owner: String) {
        transformers.removeAll { it.owner == owner }
    }

    /** Builds the server list again with the current plugin settings. */
    @JvmStatic
    fun refresh() {
        val vm = viewModel?.get() ?: return
        val state = lastState ?: return
        Utils.threadPool.execute {
            try {
                handleStoreState.invoke(vm, state)
            } catch (e: Throwable) {
                logger.error("Failed to refresh the server list", e)
            }
        }
    }

    private fun withSortedGuilds(state: WidgetGuildsListViewModel.StoreState, entries: List<StoreGuildsSorted.Entry>): Any {
        val method = copyState
        val types = method.parameterTypes
        val args = arrayOfNulls<Any>(types.size)
        args[0] = state
        for (i in 1 until types.size - 2) {
            args[i] = when (types[i]) {
                Long::class.javaPrimitiveType -> 0L
                Boolean::class.javaPrimitiveType -> false
                Int::class.javaPrimitiveType -> 0
                else -> null
            }
        }
        args[9] = entries // first value is at index 1, so component9 is at index 9
        val all = (1 shl (types.size - 3)) - 1
        args[types.size - 2] = all and (1 shl 8).inv()
        return method.invoke(null, *args)!!
    }

    private fun locked(holder: RecyclerView.ViewHolder?): Boolean {
        if (holder !is GuildListViewHolder.GuildViewHolder || transformers.isEmpty()) return false
        val item = holderData.get(holder) as? GuildListItem ?: return false
        return transformers.any {
            try {
                it.value.isLocked(item)
            } catch (e: Throwable) {
                false
            }
        }
    }

    @Synchronized
    private fun ensurePatched() {
        if (patched) return
        patched = true

        patcher.patch(handleStoreState, object : de.robv.android.xposed.XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                val state = param.args[0] as? WidgetGuildsListViewModel.StoreState ?: return
                val vm = param.thisObject as WidgetGuildsListViewModel
                if (viewModel?.get() !== vm) viewModel = WeakReference(vm)
                lastState = state
                inHandle.set(true)
                if (transformers.isEmpty()) return
                try {
                    val entries = ArrayList(state.sortedGuilds)
                    for (reg in transformers) {
                        try {
                            reg.value.entries(entries)
                        } catch (e: Throwable) {
                            logger.error("${reg.owner}: failed to change the server list", e)
                        }
                    }
                    if (entries != state.sortedGuilds) param.args[0] = withSortedGuilds(state, entries)
                } catch (e: Throwable) {
                    logger.error("Failed to change the server list", e)
                }
            }

            override fun afterHookedMethod(param: MethodHookParam) {
                inHandle.set(false)
            }
        })

        patcher.before<WidgetGuildsListViewModel.ViewState.Loaded>(
            List::class.java, Boolean::class.javaPrimitiveType!!, Boolean::class.javaPrimitiveType!!,
        ) { param ->
            if (inHandle.get() != true || transformers.isEmpty()) return@before
            @Suppress("UNCHECKED_CAST")
            val items = ArrayList(param.args[0] as? List<GuildListItem> ?: return@before)
            for (reg in transformers) {
                try {
                    reg.value.items(items)
                } catch (e: Throwable) {
                    logger.error("${reg.owner}: failed to change the server list rows", e)
                }
            }
            param.args[0] = items
        }

        patcher.before<WidgetGuildsListViewModel>("onDrop") { dropping = true }
        patcher.after<WidgetGuildsListViewModel>("onDrop") { dropping = false }

        patcher.before<StoreGuildsSorted>("setPositions", List::class.java) { param ->
            if (!dropping || transformers.isEmpty()) return@before
            @Suppress("UNCHECKED_CAST")
            val list = param.args[0] as? MutableList<StoreGuildsSorted.Entry> ?: return@before
            val saved = ArrayList(this.entries)
            for (reg in transformers.reversed()) {
                try {
                    reg.value.beforeSave(list, saved)
                } catch (e: Throwable) {
                    logger.error("${reg.owner}: failed to fix the saved server order", e)
                }
            }
        }

        patcher.after<GuildListViewHolder.GuildViewHolder>("canDrag") { param ->
            if (param.result == true && locked(this)) param.result = false
        }
        patcher.before<WidgetGuildListAdapter>(
            "onMove", RecyclerView::class.java, RecyclerView.ViewHolder::class.java, RecyclerView.ViewHolder::class.java,
        ) { param ->
            if (locked(param.args[1] as? RecyclerView.ViewHolder) || locked(param.args[2] as? RecyclerView.ViewHolder)) {
                param.result = false
            }
        }
        patcher.after<WidgetGuildListAdapter>(
            "chooseDropTarget", RecyclerView.ViewHolder::class.java, List::class.java,
            Int::class.javaPrimitiveType!!, Int::class.javaPrimitiveType!!,
        ) { param ->
            if (locked(param.result as? RecyclerView.ViewHolder)) param.result = null
        }
    }

    // ---- Helpers to edit entry lists ----

    /** Every server in [entries], in order, with the folder it is in (or null). */
    @JvmStatic
    fun guildsOf(entries: List<StoreGuildsSorted.Entry>): List<Guild> {
        val out = ArrayList<Guild>()
        for (entry in entries) {
            when (entry) {
                is StoreGuildsSorted.Entry.SingletonGuild -> out += entry.guild
                is StoreGuildsSorted.Entry.Folder -> out += entry.guilds
            }
        }
        return out
    }

    /** Index of the top level entry of [entries] containing [guildId], or -1. */
    @JvmStatic
    fun indexOfGuild(entries: List<StoreGuildsSorted.Entry>, guildId: Long): Int = entries.indexOfFirst { entry ->
        when (entry) {
            is StoreGuildsSorted.Entry.SingletonGuild -> entry.guild.id == guildId
            is StoreGuildsSorted.Entry.Folder -> entry.guilds.any { it.id == guildId }
            else -> false
        }
    }

    /** Removes the servers matching [predicate] from [entries], dropping folders that end up empty. */
    @JvmStatic
    fun removeGuilds(entries: MutableList<StoreGuildsSorted.Entry>, predicate: (Guild) -> Boolean) {
        val it = entries.listIterator()
        while (it.hasNext()) {
            when (val entry = it.next()) {
                is StoreGuildsSorted.Entry.SingletonGuild -> if (predicate(entry.guild)) it.remove()
                is StoreGuildsSorted.Entry.Folder -> {
                    if (entry.guilds.none(predicate)) continue
                    val kept = entry.guilds.filterNot(predicate)
                    if (kept.isEmpty()) it.remove()
                    else it.set(StoreGuildsSorted.Entry.Folder(entry.id, kept, entry.color, entry.name))
                }
            }
        }
    }

    /**
     * Puts the servers of [saved] that are missing from [entries] back where they were relative to their
     * neighbours: into their folder when it still exists, otherwise after the closest earlier entry.
     */
    @JvmStatic
    fun restoreMissing(entries: MutableList<StoreGuildsSorted.Entry>, saved: List<StoreGuildsSorted.Entry>) {
        val present = HashSet<Long>()
        guildsOf(entries).forEach { present += it.id }

        for ((savedIndex, savedEntry) in saved.withIndex()) {
            when (savedEntry) {
                is StoreGuildsSorted.Entry.SingletonGuild -> {
                    if (savedEntry.guild.id in present) continue
                    entries.add(insertionIndex(entries, saved, savedIndex), savedEntry)
                    present += savedEntry.guild.id
                }
                is StoreGuildsSorted.Entry.Folder -> {
                    val missing = savedEntry.guilds.filter { it.id !in present }
                    if (missing.isEmpty()) continue
                    val folderIndex = entries.indexOfFirst { it is StoreGuildsSorted.Entry.Folder && it.id == savedEntry.id }
                    if (folderIndex >= 0) {
                        val folder = entries[folderIndex] as StoreGuildsSorted.Entry.Folder
                        val guilds = ArrayList(folder.guilds)
                        for (guild in missing) {
                            // after the closest earlier server of the saved folder that is still in it
                            val pos = savedEntry.guilds.indexOf(guild)
                            var at = 0
                            for (i in pos - 1 downTo 0) {
                                val idx = guilds.indexOfFirst { it.id == savedEntry.guilds[i].id }
                                if (idx >= 0) {
                                    at = idx + 1
                                    break
                                }
                            }
                            guilds.add(at, guild)
                        }
                        entries[folderIndex] = StoreGuildsSorted.Entry.Folder(folder.id, guilds, folder.color, folder.name)
                    } else {
                        entries.add(
                            insertionIndex(entries, saved, savedIndex),
                            StoreGuildsSorted.Entry.Folder(savedEntry.id, missing, savedEntry.color, savedEntry.name),
                        )
                    }
                    missing.forEach { present += it.id }
                }
            }
        }
    }

    private fun insertionIndex(entries: List<StoreGuildsSorted.Entry>, saved: List<StoreGuildsSorted.Entry>, savedIndex: Int): Int {
        for (i in savedIndex - 1 downTo 0) {
            val index = when (val previous = saved[i]) {
                is StoreGuildsSorted.Entry.SingletonGuild -> indexOfGuild(entries, previous.guild.id)
                is StoreGuildsSorted.Entry.Folder -> entries.indexOfFirst { it is StoreGuildsSorted.Entry.Folder && it.id == previous.id }
                    .let { if (it >= 0) it else previous.guilds.map { g -> indexOfGuild(entries, g.id) }.firstOrNull { idx -> idx >= 0 } ?: -1 }
                else -> -1
            }
            if (index >= 0) return index + 1
        }
        return 0
    }
}
