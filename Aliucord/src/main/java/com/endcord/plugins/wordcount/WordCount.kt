/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.wordcount

import android.content.Context
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.api.mutedColor

internal class WordCount : EndcordPlugin(
    name = "WordCount",
    description = "Shows the word count of a message below it",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    // Appended last, after every other plugin changed the text
    private val decorator = object : ChatDecorator(name, priority = 100) {
        override fun decorateText(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, text: SpannableStringBuilder) {
            val content = entry.message.content ?: return
            val words = countWords(content)
            // Like Endcord PC, short messages get no count
            if (words <= 5 || text.isEmpty()) return

            val line = I18n.t("{words} words, {characters} characters", "words" to words, "characters" to content.length)
            val start = text.length
            text.append('\n').append(line)
            val end = text.length
            text.setSpan(RelativeSizeSpan(0.75f), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            text.setSpan(ForegroundColorSpan(mutedColor(holder.itemView.context)), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
    }

    /** Counts runs of non-whitespace, like splitting on `\s+` and dropping empty parts. */
    private fun countWords(content: String): Int {
        var count = 0
        var inWord = false
        for (c in content) {
            if (c.isWhitespace()) {
                inWord = false
            } else if (!inWord) {
                inWord = true
                count++
            }
        }
        return count
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        super.stop(context)
    }
}
