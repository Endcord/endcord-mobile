/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.copyemojimarkdown

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.actionscommon.MessageParts
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R

internal class CopyEmojiMarkdown : EndcordPlugin(
    name = "CopyEmojiMarkdown",
    description = "Allows you to copy emojis as formatted string (<:blobcatcozy:1026533070955872337>)",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("emotes", "utility")

    override fun start(context: Context) {
        MessageActions.register(
            name,
            "Copy Emoji Markdown",
            R.e.ic_emoji_24dp,
            visible = { MessageParts.hasCustomEmojis(it.message) },
        ) { ctx ->
            val emojis = MessageParts.customEmojis(ctx.message)
            when (emojis.size) {
                0 -> return@register
                1 -> copy(emojis[0].markdown)
                else -> {
                    val items = emojis.map { ":${it.name}:" } + I18n.t("Copy all")
                    Common.pick(ctx.sheet.parentFragmentManager, I18n.t("Copy Emoji Markdown"), items) { index ->
                        copy(if (index < emojis.size) emojis[index].markdown else emojis.joinToString(" ") { it.markdown })
                    }
                }
            }
        }
    }

    private fun copy(markdown: String) = Common.copy(markdown, "Success! Copied emoji markdown.")
}
