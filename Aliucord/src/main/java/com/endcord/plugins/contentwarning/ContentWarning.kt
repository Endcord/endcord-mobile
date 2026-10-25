/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.contentwarning

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.discord.models.message.Message
import com.endcord.plugins.messagesacommon.AttachmentSpoilers
import com.endcord.plugins.messagesacommon.ChatListFilter
import com.endcord.plugins.messagesacommon.MessageRenderHooks
import java.util.Locale

internal class ContentWarning : EndcordPlugin(
    name = "ContentWarning",
    description = "Allows you to specify certain trigger words that will be hidden behind a spoiler by default. Tapping the spoiler reveals it.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            key = "words",
            label = "Flagged Words",
            description = "Messages containing any of these words are covered until tapped. Separate words with commas or new lines",
            multiline = true,
        ),
    )

    @Volatile
    private var cached: Pair<String, List<String>>? = null

    override fun start(context: Context) {
        MessageRenderHooks.register(name, object : MessageRenderHooks.Handler {
            override fun beforeParse(render: MessageRenderHooks.Render) {
                val content = render.content
                if (content.isBlank() || !isFlagged(render.message)) return
                // One spoiler around the whole text. Inner spoiler markers would split it, so they go
                render.content = "||" + content.replace("||", "") + "||"
            }
        })
        AttachmentSpoilers.register(name) { entry -> isFlagged(entry.message) }
        ChatListFilter.redrawVisible()
    }

    override fun stop(context: Context) {
        MessageRenderHooks.unregisterAll(name)
        AttachmentSpoilers.unregisterAll(name)
        cached = null
        super.stop(context)
        ChatListFilter.redrawVisible()
    }

    private fun words(): List<String> {
        val raw = string("words")
        cached?.let { if (it.first == raw) return it.second }
        val words = list("words").map { it.lowercase(Locale.ROOT) }
        cached = raw to words
        return words
    }

    private fun isFlagged(message: Message): Boolean {
        val content = message.content ?: return false
        if (content.isEmpty()) return false
        val words = words()
        if (words.isEmpty()) return false
        val lower = content.lowercase(Locale.ROOT)
        return words.any { lower.contains(it) }
    }
}
