/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.textcommands

import android.content.Context
import com.aliucord.api.CommandsAPI
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin

internal class ReverseText : EndcordPlugin(
    name = "ReverseText",
    description = "/reverse flips your message backwards.",
    authors = arrayOf("ewlle"),
) {
    override val tags = listOf("fun", "commands")

    override fun start(context: Context) {
        commands.registerCommand("reverse", "Flips your message backwards", CommandsAPI.requiredMessageOption) { ctx ->
            // Reverse by code point so emoji and other surrogate pairs survive
            val text = ctx.getRequiredString("message")
            val codePoints = text.codePoints().toArray()
            codePoints.reverse()
            CommandResult(String(codePoints, 0, codePoints.size), null, true)
        }
    }
}
