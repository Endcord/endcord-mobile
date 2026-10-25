/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.vibecheck

import android.content.Context
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin

internal class VibeCheck : EndcordPlugin(
    name = "VibeCheck",
    description = "Adds /vibe to drop a random vaporwave mood into chat.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("fun", "commands")

    private val vibes = arrayOf(
        "✦ the vibes are immaculate ✦",
        "🌴 endless summer, endless mall 🌴",
        "📼 rewinding to a time that never was 📼",
        "🛍️ welcome to the mall, population: you 🛍️",
        "🌅 chasing a sunset that never sets 🌅",
        "💾 saving your aesthetic... done 💾",
        "🪩 disco ball energy detected 🪩",
        "🌊 floating on a sea of neon 🌊",
        "☎️ this call is being routed through 1987 ☎️",
        "🍹 sipping something pink by the fountain 🍹",
    )

    override fun start(context: Context) {
        commands.registerCommand("vibe", "Send a random vaporwave vibe") {
            CommandResult(vibes.random(), null, true)
        }
    }
}
