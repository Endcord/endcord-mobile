/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagelogger

import com.discord.models.message.Message
import com.endcord.plugins.messagesacommon.MessageStoreAccess

/**
 * Everything MessageLogger remembers, kept in memory only: the edit history of messages and a log of
 * recently deleted and edited messages. Deleted messages themselves stay in Discord's message cache, carrying
 * [DELETED_FLAG] in their flags.
 */
internal object MessageLog {
    /** A message flag Discord doesn't use, marking messages that were deleted while we watched. */
    const val DELETED_FLAG = 1L shl 52

    /** How many versions of a single message are kept. */
    private const val MAX_VERSIONS = 25

    enum class Kind { DELETED, EDITED, GHOST_PING }

    /** An earlier version of a message, and when it was replaced. */
    class Edit(@JvmField val editedAt: Long, @JvmField val content: String)

    /** A line of the message log. */
    class Entry(
        @JvmField val kind: Kind,
        @JvmField val messageId: Long,
        @JvmField val channelId: Long,
        @JvmField val guildId: Long,
        @JvmField val authorName: String,
        @JvmField val content: String,
        @JvmField val newContent: String?,
        @JvmField val attachments: Int,
        @JvmField val loggedAt: Long,
    )

    private val lock = Any()
    private val entries = java.util.ArrayDeque<Entry>()
    private val edits = LinkedHashMap<Long, List<Edit>>()

    /** How many log entries and edited messages are remembered at most. */
    @Volatile
    var limit = 500

    fun isDeleted(message: Message): Boolean = ((message.flags ?: 0L) and DELETED_FLAG) != 0L

    fun markDeleted(message: Message): Message =
        MessageStoreAccess.copyWithFlags(message, (message.flags ?: 0L) or DELETED_FLAG)

    fun unmarkDeleted(message: Message): Message =
        MessageStoreAccess.copyWithFlags(message, (message.flags ?: 0L) and DELETED_FLAG.inv())

    /** The earlier versions of a message, oldest first, or null if it was never edited while logging. */
    fun editsOf(messageId: Long): List<Edit>? = synchronized(lock) { edits[messageId] }

    fun hasEdits(messageId: Long): Boolean = synchronized(lock) { edits.containsKey(messageId) }

    fun addEdit(messageId: Long, edit: Edit) {
        synchronized(lock) {
            val old = edits.remove(messageId)
            val versions = ArrayList<Edit>((old?.size ?: 0) + 1)
            if (old != null) versions.addAll(old)
            versions.add(edit)
            while (versions.size > MAX_VERSIONS) versions.removeAt(0)
            edits[messageId] = versions
            while (edits.size > limit) {
                val oldest = edits.keys.iterator()
                oldest.next()
                oldest.remove()
            }
        }
    }

    fun clearEdits(messageId: Long) {
        synchronized(lock) { edits.remove(messageId) }
    }

    fun add(entry: Entry) {
        synchronized(lock) {
            entries.addLast(entry)
            while (entries.size > limit) entries.removeFirst()
        }
    }

    /** The log, newest first. */
    fun snapshot(): List<Entry> = synchronized(lock) {
        val list = ArrayList<Entry>(entries.size)
        val newestFirst = entries.descendingIterator()
        while (newestFirst.hasNext()) list.add(newestFirst.next())
        list
    }

    fun clear() {
        synchronized(lock) {
            entries.clear()
            edits.clear()
        }
    }
}
