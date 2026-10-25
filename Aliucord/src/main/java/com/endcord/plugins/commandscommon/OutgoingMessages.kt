/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.commandscommon

import android.content.Context
import com.aliucord.Logger
import com.aliucord.api.PatcherAPI
import com.aliucord.patcher.before
import com.discord.widgets.chat.MessageContent
import com.discord.widgets.chat.MessageManager
import com.discord.widgets.chat.input.ChatInputViewModel
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Lets plugins rewrite the text of a message right before it is sent or saved after editing, the mobile
 * counterpart of Endcord PC's pre-send listeners. Every send from the chat box, including the result of a
 * slash command with `send = true`, goes through `ChatInputViewModel.sendMessage`, which is patched once.
 */
internal object OutgoingMessages {
    private class Entry(val owner: String, val transform: (String) -> String)

    private val logger = Logger("OutgoingMessages")
    private val entries = CopyOnWriteArrayList<Entry>()
    private var patched = false

    /** Adds a rewrite step. [transform] gets the current text and returns the text to send. */
    @JvmStatic
    fun register(owner: String, transform: (String) -> String) {
        entries += Entry(owner, transform)
        ensurePatched()
    }

    /** Removes every rewrite step added by [owner]. */
    @JvmStatic
    fun unregisterAll(owner: String) {
        entries.removeAll { it.owner == owner }
    }

    @Synchronized
    private fun ensurePatched() {
        if (patched) return
        patched = true

        PatcherAPI(logger).before<ChatInputViewModel>(
            "sendMessage",
            Context::class.java,
            MessageManager::class.java,
            MessageContent::class.java,
            List::class.java,
            Boolean::class.javaPrimitiveType!!,
            Function1::class.java,
        ) { param ->
            if (entries.isEmpty()) return@before
            try {
                val content = param.args[2] as? MessageContent ?: return@before
                val original = content.textContent ?: return@before
                var text: String = original
                for (entry in entries) {
                    text = try {
                        entry.transform(text)
                    } catch (e: Throwable) {
                        logger.error("${entry.owner}: failed to rewrite a message", e)
                        text
                    }
                }
                if (text != original) param.args[2] = MessageContent(text, content.mentionedUsers)
            } catch (e: Throwable) {
                logger.error("Failed to rewrite a message", e)
            }
        }
    }
}
