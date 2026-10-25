/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.doubleclickedit

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.translatecommon.ChatActions
import com.endcord.plugins.translatecommon.DoubleTaps

internal class DoubleClickEdit : EndcordPlugin(
    name = "DoubleClickEdit",
    description = "Double-tap your own messages to edit them instantly.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override fun start(context: Context) {
        DoubleTaps.register(name) { message ->
            if (message.content.isNullOrEmpty() || !ChatActions.canEdit(message)) return@register false
            ChatActions.startEdit(message)
            true
        }
    }

    override fun stop(context: Context) {
        DoubleTaps.unregisterAll(name)
        super.stop(context)
    }
}
