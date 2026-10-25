/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagelogger

import com.aliucord.Logger
import com.aliucord.Utils
import com.discord.models.message.Message
import com.endcord.plugins.messagesacommon.MessageStoreAccess
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Everything MessageLogger remembers: the edit history of messages and a log of recently deleted and edited
 * messages, in memory. Deleted messages themselves stay in Discord's message cache, carrying [DELETED_FLAG] in
 * their flags. When [persist] is on, the log (not the chat state) is also saved in the app's private storage.
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

    /** Whether the log is saved so it survives restarts. */
    @Volatile
    var persist = false

    private val logger = Logger("MessageLogger")
    private var saveScheduled = false

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
        if (persist) scheduleSave()
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
        Utils.threadPool.execute { deleteSaved() }
    }

    // region Saved log

    private fun file() = File(Utils.appContext.filesDir, "endcord-message-log.json")

    /** Saves the log a moment after the last change, so bursts of deletes are written once. */
    private fun scheduleSave() {
        synchronized(lock) {
            if (saveScheduled) return
            saveScheduled = true
        }
        Utils.mainThread.postDelayed({ Utils.threadPool.execute { save() } }, 2000)
    }

    private fun save() {
        val list = synchronized(lock) {
            saveScheduled = false
            ArrayList(entries)
        }
        if (!persist) return
        try {
            val json = JSONArray()
            for (e in list) {
                json.put(
                    JSONObject()
                        .put("kind", e.kind.name)
                        .put("messageId", e.messageId)
                        .put("channelId", e.channelId)
                        .put("guildId", e.guildId)
                        .put("author", e.authorName)
                        .put("content", e.content)
                        .put("newContent", e.newContent ?: JSONObject.NULL)
                        .put("attachments", e.attachments)
                        .put("loggedAt", e.loggedAt)
                )
            }
            file().writeText(json.toString())
        } catch (e: Throwable) {
            logger.error("Failed to save the message log", e)
        }
    }

    /** Puts the saved log in front of what was logged since starting. Call from a background thread. */
    fun loadSaved() {
        val file = file()
        if (!file.exists()) return
        try {
            val json = JSONArray(file.readText())
            val loaded = ArrayList<Entry>(json.length())
            for (i in 0 until json.length()) {
                val o = json.getJSONObject(i)
                val kind = Kind.values().firstOrNull { it.name == o.optString("kind") } ?: continue
                loaded += Entry(
                    kind = kind,
                    messageId = o.optLong("messageId"),
                    channelId = o.optLong("channelId"),
                    guildId = o.optLong("guildId"),
                    authorName = o.optString("author"),
                    content = o.optString("content"),
                    newContent = if (o.isNull("newContent")) null else o.optString("newContent"),
                    attachments = o.optInt("attachments"),
                    loggedAt = o.optLong("loggedAt"),
                )
            }
            synchronized(lock) {
                val current = ArrayList(entries)
                entries.clear()
                entries.addAll(loaded)
                entries.addAll(current)
                while (entries.size > limit) entries.removeFirst()
            }
        } catch (e: Throwable) {
            logger.error("Failed to load the saved message log", e)
        }
    }

    /** Removes the saved log. Call from a background thread. */
    fun deleteSaved() {
        try {
            file().delete()
        } catch (e: Throwable) {
            logger.error("Failed to delete the saved message log", e)
        }
    }

    // endregion
}
