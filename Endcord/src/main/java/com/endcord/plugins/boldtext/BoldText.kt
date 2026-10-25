/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.boldtext

import android.content.Context
import com.aliucord.api.CommandsAPI
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin

internal class BoldText : EndcordPlugin(
    name = "BoldText",
    description = "/bold turns your message into 𝐮𝐧𝐢𝐜𝐨𝐝𝐞 bold (works where markdown can't).",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("fun", "commands")

    override fun start(context: Context) {
        commands.registerCommand("bold", "Make your text unicode-bold", CommandsAPI.requiredMessageOption) { ctx ->
            CommandResult(toBold(ctx.getRequiredString("message")), null, true)
        }
    }

    private fun toBold(text: String): String {
        val sb = StringBuilder(text.length * 2)
        text.codePoints().forEach { c ->
            sb.appendCodePoint(
                when (c) {
                    in 'A'.code..'Z'.code -> 0x1D400 + c - 'A'.code
                    in 'a'.code..'z'.code -> 0x1D41A + c - 'a'.code
                    in '0'.code..'9'.code -> 0x1D7CE + c - '0'.code
                    else -> c
                }
            )
        }
        return sb.toString()
    }
}
