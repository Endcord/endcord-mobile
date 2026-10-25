/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.translatecommon

import android.os.SystemClock
import android.view.ViewConfiguration
import com.aliucord.Logger
import com.aliucord.api.PatcherAPI
import com.aliucord.patcher.before
import com.discord.models.message.Message
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterEventsHandler

/**
 * Detects double taps on messages in the chat, for the plugins that act on them. Discord's message rows report
 * every tap through `WidgetChatListAdapterEventsHandler.onMessageClicked`, which is patched once for all of them.
 */
internal object DoubleTaps {
    private class Entry(val owner: String, val handler: (Message) -> Boolean)

    private val logger = Logger("DoubleTaps")

    @Volatile
    private var entries: Array<Entry> = emptyArray()
    private var patcher: PatcherAPI? = null

    private var lastMessageId = 0L
    private var lastTapAt = 0L

    /**
     * Calls [handler] when a message is tapped twice in a row. Handlers run in registration order until one
     * returns true. Runs on the main thread.
     */
    @Synchronized
    fun register(owner: String, handler: (Message) -> Boolean) {
        entries = (entries.toList() + Entry(owner, handler)).toTypedArray()
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

    private fun install() {
        val p = PatcherAPI(logger)
        patcher = p
        p.before<WidgetChatListAdapterEventsHandler>(
            "onMessageClicked",
            Message::class.java,
            Boolean::class.javaPrimitiveType!!,
        ) { param ->
            try {
                val message = param.args[0] as Message? ?: return@before
                val now = SystemClock.uptimeMillis()
                // A little more generous than the system double tap timeout, rows rebind between taps
                val isDouble = message.id == lastMessageId && now - lastTapAt <= ViewConfiguration.getDoubleTapTimeout() + 150
                if (!isDouble) {
                    lastMessageId = message.id
                    lastTapAt = now
                    return@before
                }
                lastMessageId = 0L
                for (entry in entries) {
                    val handled = try {
                        entry.handler(message)
                    } catch (e: Throwable) {
                        logger.error("${entry.owner} failed to handle a double tap", e)
                        false
                    }
                    if (handled) break
                }
            } catch (e: Throwable) {
                logger.error("Failed to handle a message tap", e)
            }
        }
    }
}
