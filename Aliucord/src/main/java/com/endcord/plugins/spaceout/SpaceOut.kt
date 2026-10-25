/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.spaceout

import android.content.Context
import com.aliucord.api.CommandsAPI
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin

internal class SpaceOut : EndcordPlugin(
    name = "SpaceOut",
    description = "/spaceout p u t s   s p a c e s   between every letter.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("fun", "commands")

    override fun start(context: Context) {
        commands.registerCommand("spaceout", "Space out every letter", CommandsAPI.requiredMessageOption) { ctx ->
            // Split by code point so emoji aren't torn in half
            val text = ctx.getRequiredString("message")
            val sb = StringBuilder(text.length * 2)
            text.codePoints().forEach { c ->
                if (sb.isNotEmpty()) sb.append(' ')
                sb.appendCodePoint(c)
            }
            CommandResult(sb.toString(), null, true)
        }
    }
}
