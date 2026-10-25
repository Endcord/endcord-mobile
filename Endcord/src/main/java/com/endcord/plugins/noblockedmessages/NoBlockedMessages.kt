/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.noblockedmessages

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.utils.RxUtils.subscribe
import com.discord.stores.StoreStream
import com.endcord.plugins.messagesacommon.ChatListFilter
import rx.Subscription

internal class NoBlockedMessages : EndcordPlugin(
    name = "NoBlockedMessages",
    description = "Hides all blocked/ignored messages from chat completely",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("accessibility", "chat")

    private var relationships: Subscription? = null

    override fun start(context: Context) {
        ChatListFilter.addMessageFilter(name) { message ->
            val authorId = message.author?.id ?: return@addMessageFilter false
            isBlocked(authorId)
        }
        // Blocking or unblocking someone doesn't rebuild the chat by itself
        relationships = StoreStream.getUserRelationships().observe().subscribe { ChatListFilter.refresh() }
    }

    override fun stop(context: Context) {
        relationships?.unsubscribe()
        relationships = null
        ChatListFilter.unregisterAll(name)
        super.stop(context)
    }

    companion object {
        /** Discord's relationship type for blocked users. */
        private const val BLOCKED = 2

        fun isBlocked(userId: Long): Boolean =
            StoreStream.getUserRelationships().relationships[userId] == BLOCKED
    }
}
