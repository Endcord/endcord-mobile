/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messageclickactions

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.endcord.plugins.translatecommon.ChatActions
import com.endcord.plugins.translatecommon.DoubleTaps

/** Endcord PC's double click actions as double taps. Holding Backspace to delete needs a keyboard, so it isn't ported. */
internal class MessageClickActions : EndcordPlugin(
    name = "MessageClickActions",
    description = DESCRIPTION,
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "shortcuts")

    override val settingsSchema = listOf(
        PluginSetting.Switch("enableDoubleClickToEdit", "Double-tap your own messages to edit them", default = true),
        PluginSetting.Switch("enableDoubleClickToReply", "Double-tap other messages to reply to them", default = true),
    )

    override fun start(context: Context) {
        DoubleTaps.register(name) { message ->
            if (ChatActions.canEdit(message)) {
                if (!bool("enableDoubleClickToEdit") || message.content.isNullOrEmpty()) return@register false
                ChatActions.startEdit(message)
                true
            } else {
                if (!bool("enableDoubleClickToReply") || !ChatActions.canReply(message)) return@register false
                ChatActions.startReply(message)
                true
            }
        }
    }

    override fun stop(context: Context) {
        DoubleTaps.unregisterAll(name)
        super.stop(context)
    }

    private companion object {
        const val DESCRIPTION = "Double-tap a message to edit it if it's yours, or to reply to it otherwise."
    }
}
