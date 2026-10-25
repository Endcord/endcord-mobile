/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.starify

import android.content.Context
import com.aliucord.api.CommandsAPI
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin

internal class Starify : EndcordPlugin(
    name = "Starify",
    description = "Adds /starify to wrap your message in sparkles ｡ﾟ☆.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("fun", "commands")

    override fun start(context: Context) {
        commands.registerCommand("starify", "Decorate your message with sparkles", CommandsAPI.requiredMessageOption) { ctx ->
            CommandResult("✦ﾟ｡⋆ ${ctx.getRequiredString("message")} ⋆｡ﾟ✦", null, true)
        }
    }
}
