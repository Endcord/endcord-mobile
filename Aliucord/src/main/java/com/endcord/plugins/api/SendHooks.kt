/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.api

import com.aliucord.Logger
import com.aliucord.api.PatcherAPI
import com.aliucord.patcher.before
import com.discord.widgets.chat.MessageManager

/**
 * Lets plugins rewrite the text of a message right before it is sent or an edit is saved, the mobile
 * counterpart of Endcord PC's `onBeforeMessageSend` / `onBeforeMessageEdit`. Slash commands are not affected.
 */
internal object SendHooks {
    private class Entry(val owner: String, val onEdit: Boolean, val transform: (String) -> String)

    private val logger = Logger("SendHooks")

    @Volatile
    private var entries: Array<Entry> = emptyArray()
    private var patcher: PatcherAPI? = null

    /**
     * Registers [transform] to run on every message the user sends, and on edits too when [onEdit] is set.
     * Return the text unchanged when there is nothing to do.
     */
    @Synchronized
    fun register(owner: String, onEdit: Boolean, transform: (String) -> String) {
        entries = (entries.toList() + Entry(owner, onEdit, transform)).toTypedArray()
        if (patcher == null) install()
    }

    @Synchronized
    fun unregisterAll(owner: String) {
        entries = entries.filter { it.owner != owner }.toTypedArray()
        if (entries.isEmpty()) {
            patcher?.unpatchAll()
            patcher = null
        }
    }

    private fun apply(content: String, edit: Boolean): String {
        var res = content
        for (e in entries) {
            if (edit && !e.onEdit) continue
            res = try {
                e.transform(res)
            } catch (t: Throwable) {
                logger.error("${e.owner} failed to process a message before sending", t)
                res
            }
        }
        return res
    }

    private fun install() {
        val p = PatcherAPI(logger)
        patcher = p
        val long = Long::class.javaPrimitiveType!!

        p.before<MessageManager>(
            "sendMessage",
            String::class.java,
            List::class.java,
            MessageManager.AttachmentsRequest::class.java,
            Long::class.javaObjectType,
            List::class.java,
            Boolean::class.javaPrimitiveType!!,
            Function2::class.java,
            Function2::class.java,
            Function1::class.java,
        ) { param ->
            val content = param.args[0] as String? ?: return@before
            if (content.isEmpty()) return@before
            param.args[0] = apply(content, false)
        }

        p.before<MessageManager>(
            "editMessage",
            long,
            long,
            String::class.java,
            Function2::class.java,
            Int::class.javaObjectType,
        ) { param ->
            val content = param.args[2] as String? ?: return@before
            if (content.isEmpty()) return@before
            param.args[2] = apply(content, true)
        }
    }
}
