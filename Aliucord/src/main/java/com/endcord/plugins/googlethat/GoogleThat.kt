/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.googlethat

import android.content.Context
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.endcord.plugins.commandscommon.Net
import com.endcord.plugins.commandscommon.Options

internal class GoogleThat : EndcordPlugin(
    name = "GoogleThat",
    description = "Adds a command to send a internet search link",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("commands", "utility")

    private val searchEngines = linkedMapOf(
        "Google" to "https://www.google.com/search?q=",
        "Bing" to "https://www.bing.com/search?q=",
        "Yahoo" to "https://search.yahoo.com/search?p=",
        "DuckDuckGo" to "https://duckduckgo.com/?q=",
        "Baidu" to "https://www.baidu.com/s?wd=",
        "Yandex" to "https://yandex.com/search/?text=",
        "Ecosia" to "https://www.ecosia.org/search?q=",
        "Ask" to "https://www.ask.com/web?q=",
        "AOL" to "https://search.aol.com/aol/search?q=",
        "LetMeGoogleThatForYou" to "https://letmegooglethat.com/?q=",
    )

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            key = "hyperlink",
            label = "Hyperlink",
            description = "If the sent link should hyperlink with the query as the label",
        ),
        PluginSetting.Switch(
            key = "embed",
            label = "Embed",
            description = "If the sent link should render an embed",
            default = true,
        ),
        PluginSetting.Choice(
            key = "defaultEngine",
            label = "The search engine to use",
            options = searchEngines.keys.map { PluginSetting.Choice.Option(it, it) },
        ),
        PluginSetting.Text(
            key = "customEngineURL",
            label = "Custom engine URL",
            description = "The URL of the Engine you wish to use",
            placeholder = "https://example.com/search?q=",
        ),
    )

    override fun start(context: Context) {
        commands.registerCommand(
            "googlethat",
            "send a search engine link",
            listOf(Options.string("input", "The search query", required = true)),
        ) { ctx ->
            CommandResult(buildMessage(ctx.getRequiredString("input")), null, true)
        }
    }

    private fun buildMessage(input: String): String {
        val custom = string("customEngineURL").trim()
        val base = custom.ifEmpty { searchEngines[choice("defaultEngine")] ?: searchEngines.getValue("Google") }
        val url = base + Net.encodeURIComponent(input)
        val hyperlink = bool("hyperlink")
        val embed = bool("embed")
        return when {
            hyperlink && !embed -> "[$input](<$url>)"
            hyperlink -> "[$input]($url)"
            !embed -> "<$url>"
            else -> url
        }
    }
}
