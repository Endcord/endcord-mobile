/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagesacommon

import com.aliucord.Logger
import com.aliucord.api.PatcherAPI
import com.aliucord.patcher.after
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemAttachment
import com.discord.widgets.chat.list.entries.AttachmentEntry
import java.lang.reflect.Field
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Covers attachments with Discord's own spoiler overlay, so they stay hidden until tapped.
 *
 * Tapping reveals them through the app's normal spoiler handling, which remembers the choice per message
 * until the channel is left.
 */
internal object AttachmentSpoilers {
    /** Decides whether an attachment that isn't a spoiler should be covered like one. */
    fun interface Rule {
        fun cover(entry: AttachmentEntry): Boolean
    }

    private class Owned(val owner: String, val rule: Rule)

    private val logger = Logger("MessagesCommon")
    private val rules = CopyOnWriteArrayList<Owned>()
    private var patched = false

    private val spoilerHiddenField: Field by lazy {
        WidgetChatListAdapterItemAttachment.Model::class.java.getDeclaredField("isSpoilerHidden").apply { isAccessible = true }
    }

    fun register(owner: String, rule: Rule) {
        rules += Owned(owner, rule)
        ensurePatched()
    }

    fun unregisterAll(owner: String) {
        rules.removeAll { it.owner == owner }
    }

    /** Whether the user already revealed this attachment by tapping it. */
    private fun isRevealed(entry: AttachmentEntry): Boolean =
        entry.messageState?.visibleSpoilerEmbedMap?.containsKey(entry.embedIndex) == true

    @Synchronized
    private fun ensurePatched() {
        if (patched) return
        patched = true

        PatcherAPI(logger).after<WidgetChatListAdapterItemAttachment.Model>(
            AttachmentEntry::class.java,
            Map::class.java,
            Map::class.java,
            Map::class.java,
            Long::class.javaPrimitiveType!!,
        ) { param ->
            if (rules.isEmpty() || isSpoilerHidden) return@after
            val entry = param.args[0] as AttachmentEntry? ?: return@after
            if (isRevealed(entry)) return@after

            for (owned in rules) {
                val cover = try {
                    owned.rule.cover(entry)
                } catch (e: Throwable) {
                    logger.error("${owned.owner}: attachment rule failed", e)
                    false
                }
                if (cover) {
                    spoilerHiddenField.setBoolean(this, true)
                    return@after
                }
            }
        }
    }
}
