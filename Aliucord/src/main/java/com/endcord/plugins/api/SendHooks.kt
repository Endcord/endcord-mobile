/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.api

/**
 * Text-only shorthand for [OutgoingMessages]: rewrites the text of a message the user sends from the chat input,
 * the mobile counterpart of Endcord PC's `onBeforeMessageSend` / `onBeforeMessageEdit`.
 * Slash commands and command output are never rewritten.
 */
internal object SendHooks {
    /**
     * Registers [transform] for every message the user sends, and for edits too when [onEdit] is set.
     * Return the text unchanged when there is nothing to do. [priority] orders it among the other hooks,
     * see [OutgoingMessages.Priority].
     */
    @JvmStatic
    @JvmOverloads
    fun register(owner: String, onEdit: Boolean, priority: Int = OutgoingMessages.Priority.REPLACE, transform: (String) -> String) {
        OutgoingMessages.register(owner, priority, onSend = true, onEdit = onEdit) { message ->
            if (message.content.isNotEmpty()) message.content = transform(message.content)
        }
    }

    /** Removes every hook added by [owner]. */
    @JvmStatic
    fun unregisterAll(owner: String) = OutgoingMessages.unregisterAll(owner)
}
