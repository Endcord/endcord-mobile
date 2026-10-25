/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.composercommon

import android.content.Context
import com.aliucord.entities.EndcordPlugin

/**
 * Base of the plugins that act on the message the user is about to send. Removes the plugin's
 * [OutgoingMessages] hooks and [ComposerMenu] entries when it stops.
 */
internal abstract class ComposerPlugin(
    name: String,
    description: String,
    authors: Array<String>,
) : EndcordPlugin(name, description, authors) {
    /** Runs [handler] for every message sent from the chat input, see [OutgoingMessages.register]. */
    protected fun onOutgoing(priority: Int, onSend: Boolean = true, onEdit: Boolean = false, handler: (OutgoingMessage) -> Unit) =
        OutgoingMessages.register(name, priority, onSend, onEdit, handler)

    /** Adds an entry to the send button's long-press menu, see [ComposerMenu.register]. */
    protected fun composerAction(
        label: String,
        checked: (() -> Boolean)? = null,
        visible: () -> Boolean = { true },
        onClick: (ChatInput) -> Unit,
    ) = ComposerMenu.register(name, label, checked, visible, onClick)

    override fun stop(context: Context) {
        OutgoingMessages.unregisterAll(name)
        ComposerMenu.unregisterAll(name)
        super.stop(context)
    }
}
