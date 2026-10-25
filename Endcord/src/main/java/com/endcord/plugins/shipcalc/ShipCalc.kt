/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.shipcalc

import android.content.Context
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.commandscommon.Options

internal class ShipCalc : EndcordPlugin(
    name = "ShipCalc",
    description = "/ship rates the love between two people.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("fun", "commands")

    override fun start(context: Context) {
        commands.registerCommand(
            "ship",
            "Calculate a love percentage between two people",
            listOf(
                Options.string("a", "Person one", required = true),
                Options.string("b", "Person two", required = true),
            ),
        ) { ctx ->
            val a = ctx.getRequiredString("a")
            val b = ctx.getRequiredString("b")
            val pct = score(a, b)
            val heart = when {
                pct > 80 -> "💞"
                pct > 50 -> "💖"
                pct > 25 -> "💗"
                else -> "💔"
            }
            CommandResult("$heart **$a** + **$b** = **$pct%**", null, true)
        }
    }

    /** Same hash as Endcord PC, so a couple gets the same score on every device. */
    private fun score(a: String, b: String): Int {
        val s = listOf(a.trim().lowercase(), b.trim().lowercase()).sorted().joinToString("💕")
        var h = 0L
        for (c in s) h = (h * 31 + c.code) and 0xFFFFFFFFL
        return (h % 101).toInt()
    }
}
