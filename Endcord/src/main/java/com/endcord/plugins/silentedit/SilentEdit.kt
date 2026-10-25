/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.silentedit

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.discord.stores.StoreStream
import com.endcord.plugins.messagesacommon.ChatListFilter
import com.endcord.plugins.messagesacommon.MessageRenderHooks

internal class SilentEdit : EndcordPlugin(
    name = "SilentEdit",
    description = "Hides the '(edited)' label on your own edited messages. The message stays — nothing is deleted or resent.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override fun start(context: Context) {
        MessageRenderHooks.register(name, object : MessageRenderHooks.Handler {
            override fun beforeParse(render: MessageRenderHooks.Render) {
                if (!render.showEdited) return
                val authorId = render.message.author?.id ?: return
                if (authorId == StoreStream.getUsers().me.id) render.showEdited = false
            }
        })
        ChatListFilter.redrawVisible()
    }

    override fun stop(context: Context) {
        MessageRenderHooks.unregisterAll(name)
        super.stop(context)
        ChatListFilter.redrawVisible()
    }
}
