/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.sortreactions

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.patcher.before
import com.discord.api.message.reaction.MessageReaction
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemReactions

internal class SortReactions : EndcordPlugin(
    name = "SortReactions",
    description = "Sorts reactions by count in chat.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("reactions", "utility")

    override fun start(context: Context) {
        val bool = Boolean::class.javaPrimitiveType!!
        patcher.before<WidgetChatListAdapterItemReactions>(
            "displayReactions",
            Collection::class.java,
            Long::class.javaPrimitiveType!!,
            bool,
            bool,
            bool,
        ) { param ->
            @Suppress("UNCHECKED_CAST")
            val reactions = param.args[0] as Collection<MessageReaction>? ?: return@before
            if (reactions.size < 2) return@before
            // Stable, so reactions with the same count keep Discord's order
            param.args[0] = reactions.sortedByDescending { it.a() }
        }
    }
}
