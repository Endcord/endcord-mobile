/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagesacommon

import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.api.PatcherAPI
import com.aliucord.patcher.after
import com.aliucord.patcher.before
import com.discord.models.message.Message
import com.discord.widgets.chat.list.WidgetChatList
import com.discord.widgets.chat.list.entries.*
import com.discord.widgets.chat.list.model.WidgetChatListModelMessages
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Hides messages, or parts of messages, from the chat list at the model level, before the list is built.
 *
 * Filtering the model instead of hiding views keeps the list consistent: timestamps, message grouping and
 * the "new messages" bar are computed from what is actually shown, and nothing pops in or out while scrolling.
 *
 * * Message filters drop whole messages before the list entries are created.
 * * Entry filters drop single entries (an attachment, an embed, a sticker) of a message that stays.
 *
 * Filters run on a background thread for every message of the open chat whenever it changes, so they must be
 * cheap and thread safe. Call [refresh] after the data a filter depends on changed.
 */
internal object ChatListFilter {
    /** Decides whether a whole message is hidden. */
    fun interface MessageFilter {
        fun hide(message: Message): Boolean
    }

    /** Decides whether a single list entry belonging to [message] is hidden. */
    fun interface EntryFilter {
        fun hide(entry: ChatListEntry, message: Message): Boolean
    }

    private class Owned<T>(val owner: String, val filter: T)

    private val logger = Logger("MessagesCommon")
    private val messageFilters = CopyOnWriteArrayList<Owned<MessageFilter>>()
    private val entryFilters = CopyOnWriteArrayList<Owned<EntryFilter>>()
    private var patched = false

    /** Hides every message [filter] returns true for. Removed again by [unregisterAll]. */
    fun addMessageFilter(owner: String, filter: MessageFilter) {
        messageFilters += Owned(owner, filter)
        ensurePatched()
        refresh()
    }

    /** Hides every list entry [filter] returns true for. Removed again by [unregisterAll]. */
    fun addEntryFilter(owner: String, filter: EntryFilter) {
        entryFilters += Owned(owner, filter)
        ensurePatched()
        refresh()
    }

    /** Removes the filters of [owner] and shows what they hid. */
    fun unregisterAll(owner: String) {
        val removed = messageFilters.removeAll { it.owner == owner } or entryFilters.removeAll { it.owner == owner }
        if (removed) refresh()
    }

    /** Rebuilds the open chats so changed filter results show up. */
    fun refresh() {
        if (patched) MessageStoreAccess.republishAll()
    }

    /**
     * Binds the visible messages again, for changes that only affect how a message is drawn and not the list
     * itself (the list skips messages that didn't change).
     */
    fun redrawVisible() {
        Utils.mainThread.post {
            try {
                val chat = Utils.widgetChatList ?: return@post
                WidgetChatList.`access$getAdapter$p`(chat)?.notifyDataSetChanged()
            } catch (e: Throwable) {
                logger.error("Failed to redraw the chat", e)
            }
        }
    }

    /** The message an entry of the chat list belongs to, if any. */
    fun messageOf(entry: ChatListEntry): Message? = when (entry) {
        is MessageEntry -> entry.message
        is AttachmentEntry -> entry.message
        is EmbedEntry -> entry.message
        is StickerEntry -> entry.message
        is ReactionsEntry -> entry.message
        is BotUiComponentEntry -> entry.message
        is BlockedMessagesEntry -> entry.message
        else -> null
    }

    private fun hidesMessage(message: Message): Boolean {
        for (owned in messageFilters) {
            try {
                if (owned.filter.hide(message)) return true
            } catch (e: Throwable) {
                logger.error("${owned.owner}: message filter failed", e)
            }
        }
        return false
    }

    private fun hidesEntry(entry: ChatListEntry): Boolean {
        val message = messageOf(entry) ?: return false
        for (owned in entryFilters) {
            try {
                if (owned.filter.hide(entry, message)) return true
            } catch (e: Throwable) {
                logger.error("${owned.owner}: entry filter failed", e)
            }
        }
        return false
    }

    /** [list] without the items [hide] returns true for, or [list] itself when nothing is hidden. */
    private inline fun <T> filtered(list: List<T>, hide: (T) -> Boolean): List<T> {
        var out: ArrayList<T>? = null
        for (i in list.indices) {
            val item = list[i]
            if (hide(item)) {
                if (out == null) out = ArrayList<T>(list.size).apply { addAll(list.subList(0, i)) }
            } else {
                out?.add(item)
            }
        }
        return out ?: list
    }

    @Synchronized
    private fun ensurePatched() {
        if (patched) return
        patched = true
        val patcher = PatcherAPI(logger)

        // The messages of a channel together with their state, right before the list entries are made from them
        patcher.before<WidgetChatListModelMessages.MessagesWithMetadata>(
            List::class.java,
            Map::class.java,
            Map::class.java,
            Map::class.java,
            Map::class.java,
            Map::class.java,
        ) { param ->
            if (messageFilters.isEmpty()) return@before
            @Suppress("UNCHECKED_CAST")
            val messages = param.args[0] as? List<Message> ?: return@before
            param.args[0] = filtered(messages, ::hidesMessage)
        }

        // The finished list entries of a channel
        patcher.before<WidgetChatListModelMessages>(
            List::class.java,
            Long::class.javaPrimitiveType!!,
            Long::class.javaPrimitiveType!!,
            Map::class.java,
            Long::class.javaPrimitiveType!!,
            java.lang.Long::class.java,
        ) { param ->
            if (entryFilters.isEmpty()) return@before
            @Suppress("UNCHECKED_CAST")
            val entries = param.args[0] as? List<ChatListEntry> ?: return@before
            param.args[0] = filtered(entries, ::hidesEntry)
        }

        // Settings may have changed while the chat was in the background
        patcher.after<WidgetChatList>("onViewBoundOrOnResume") {
            if (messageFilters.isNotEmpty() || entryFilters.isNotEmpty()) MessageStoreAccess.republishAll()
        }
    }
}
