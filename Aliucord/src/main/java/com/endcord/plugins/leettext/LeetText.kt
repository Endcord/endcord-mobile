/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.leettext

import android.content.Context
import com.aliucord.api.CommandsAPI
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin

internal class LeetText : EndcordPlugin(
    name = "LeetText",
    description = "/leet rewrites your message in 1337 5p34k.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("fun", "commands")

    private val swaps = mapOf(
        'a' to '4', 'e' to '3', 'i' to '1', 'o' to '0', 's' to '5',
        't' to '7', 'b' to '8', 'g' to '9', 'l' to '1',
    )

    override fun start(context: Context) {
        commands.registerCommand("leet", "Convert to leetspeak", CommandsAPI.requiredMessageOption) { ctx ->
            val text = ctx.getRequiredString("message")
            val sb = StringBuilder(text.length)
            for (c in text) sb.append(if (c in 'A'..'Z' || c in 'a'..'z') swaps[c.lowercaseChar()] ?: c else c)
            CommandResult(sb.toString(), null, true)
        }
    }
}
