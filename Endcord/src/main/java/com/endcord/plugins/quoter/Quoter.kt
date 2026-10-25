/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.quoter

import android.content.Context
import android.graphics.Typeface
import androidx.core.content.res.ResourcesCompat
import com.aliucord.Constants
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.discord.stores.StoreStream
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R

internal class Quoter : EndcordPlugin(
    name = "Quoter",
    description = "Adds the ability to create an inspirational quote image from a message.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            key = "quoteFont",
            label = "Quote font",
            description = "Font for the quote text, the author's name always uses Discord's font",
            options = listOf(
                PluginSetting.Choice.Option("sans-light", "Sans serif (light)"),
                PluginSetting.Choice.Option("serif", "Serif"),
                PluginSetting.Choice.Option("monospace", "Monospace"),
                PluginSetting.Choice.Option("discord", "Discord"),
            ),
        ),
        PluginSetting.Text(
            key = "watermark",
            label = "Watermark text",
            description = "Custom watermark text (max 32 characters)",
            default = "Made with Endcord",
        ),
    )

    override fun start(context: Context) {
        MessageActions.register(
            name,
            "Quote",
            R.e.ic_quote_white_a60_24dp,
            visible = { !it.message.content.isNullOrBlank() && it.message.author != null },
        ) { ctx ->
            val message = ctx.message
            Utils.openPageWithProxy(ctx.sheet.requireContext(), QuoterPage().apply {
                channelId = message.channelId
                author = message.author
                quote = fixUpQuote(message.content.orEmpty())
            })
        }
    }

    // The page reads and writes these, so the switches remember their state like on Endcord PC
    var grayscale: Boolean
        get() = settings.getBool("grayscale", true)
        set(value) = settings.setBool("grayscale", value)

    var showWatermark: Boolean
        get() = settings.getBool("showWatermark", false)
        set(value) = settings.setBool("showWatermark", value)

    val watermark: String get() = string("watermark")

    fun quoteFont(context: Context): Typeface = when (choice("quoteFont")) {
        "serif" -> Typeface.SERIF
        "monospace" -> Typeface.MONOSPACE
        "discord" -> nameFont(context)
        else -> Typeface.create("sans-serif-light", Typeface.NORMAL)
    }

    fun nameFont(context: Context): Typeface = try {
        ResourcesCompat.getFont(context, Constants.Fonts.whitney_medium) ?: Typeface.DEFAULT
    } catch (_: Throwable) {
        Typeface.DEFAULT
    }

    /** Turns mentions into names and custom emojis into their :name:, since the card is plain text. */
    private fun fixUpQuote(text: String): String {
        val users = StoreStream.getUsers().users
        return text
            .replace(mention) { match -> users[match.groupValues[1].toLongOrNull()]?.let { "@${it.username}" } ?: match.value }
            .replace(customEmoji) { match -> ":${match.groupValues[1]}:" }
    }

    private companion object {
        val mention = Regex("<@!?(\\d+)>")
        val customEmoji = Regex("<a?:(\\w+):\\d+>")
    }
}
