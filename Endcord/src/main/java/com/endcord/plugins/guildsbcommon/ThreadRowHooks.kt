/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.guildsbcommon

import com.aliucord.Logger
import com.aliucord.api.PatcherAPI
import com.aliucord.patcher.after
import com.discord.databinding.WidgetChannelsListItemThreadBinding
import com.discord.widgets.channels.list.WidgetChannelsListAdapter
import com.discord.widgets.channels.list.items.ChannelListItem
import com.discord.widgets.channels.list.items.ChannelListItemThread
import java.lang.reflect.Field
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Decorates thread rows of the channel list after Discord bound them. [com.endcord.plugins.guildscommon.ChannelListHooks]
 * covers text, voice and DM rows; threads have their own view holder, hooked here once for every plugin.
 * Rows are recycled: undo what you changed.
 */
internal object ThreadRowHooks {
    fun interface Decorator {
        fun thread(item: ChannelListItemThread, binding: WidgetChannelsListItemThreadBinding)
    }

    private class Reg(val owner: String, val value: Decorator)

    private val logger = Logger("ThreadRowHooks")
    private val decorators = CopyOnWriteArrayList<Reg>()
    private var patched = false

    private val bindingField: Field by lazy {
        WidgetChannelsListAdapter.ItemChannelThread::class.java.getDeclaredField("binding").apply { isAccessible = true }
    }

    @JvmStatic
    fun register(owner: String, decorator: Decorator) {
        decorators += Reg(owner, decorator)
        ensurePatched()
    }

    @JvmStatic
    fun unregisterAll(owner: String) {
        decorators.removeAll { it.owner == owner }
    }

    @Synchronized
    private fun ensurePatched() {
        if (patched) return
        patched = true
        PatcherAPI(logger).after<WidgetChannelsListAdapter.ItemChannelThread>(
            "onConfigure", Int::class.javaPrimitiveType!!, ChannelListItem::class.java,
        ) { param ->
            if (decorators.isEmpty()) return@after
            val item = param.args[1] as? ChannelListItemThread ?: return@after
            val binding = try {
                bindingField.get(this) as? WidgetChannelsListItemThreadBinding
            } catch (e: Throwable) {
                logger.error("Failed to read a thread row", e)
                null
            } ?: return@after
            for (reg in decorators) {
                try {
                    reg.value.thread(item, binding)
                } catch (e: Throwable) {
                    logger.error("${reg.owner}: failed to decorate a thread", e)
                }
            }
        }
    }
}
