/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.claptext

import android.content.Context
import com.aliucord.api.CommandsAPI
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin

internal class ClapText : EndcordPlugin(
    name = "ClapText",
    description = "Adds /clap to 👏 put 👏 claps 👏 between 👏 your 👏 words.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("fun", "commands")

    private val whitespace = Regex("\\s+")

    override fun start(context: Context) {
        commands.registerCommand("clap", "Put 👏 claps 👏 between 👏 words", CommandsAPI.requiredMessageOption) { ctx ->
            val words = ctx.getRequiredString("message").split(whitespace).filter { it.isNotEmpty() }
            CommandResult(words.joinToString(" 👏 "), null, true)
        }
    }
}
