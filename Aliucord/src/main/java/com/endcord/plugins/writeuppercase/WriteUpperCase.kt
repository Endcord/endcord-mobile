/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.writeuppercase

import android.content.Context
import com.aliucord.entities.PluginSetting
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.api.OutgoingMessages

internal class WriteUpperCase : ComposerPlugin(
    name = "WriteUpperCase",
    description = "Changes the first Letter of each Sentence in Message Inputs to Uppercase",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "customisation", "chat")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            key = "blockedWords",
            label = "Strings not to capitalise (separate with a comma)",
            default = "http, https, ok",
        ),
    )

    override fun start(context: Context) {
        onOutgoing(OutgoingMessages.Priority.STYLE + 10) { message ->
            if (message.content.isNotEmpty()) message.content = capitalise(message.content, list("blockedWords"))
        }
    }

    /**
     * Uppercases the first character of every sentence. A sentence starts at the beginning of the message and
     * after whitespace that follows `.`, `!` or `?` (optionally followed by closing quotes or brackets).
     */
    private fun capitalise(text: String, blocked: List<String>): String {
        val out = StringBuilder(text.length)
        var sentenceStart = 0
        var i = 0
        while (i <= text.length) {
            if (i == text.length || (text[i].isWhitespace() && endsSentence(text, i))) {
                out.append(capitaliseSentence(text.substring(sentenceStart, i), blocked))
                // copy the whitespace run that separates the sentences as is
                var j = i
                while (j < text.length && text[j].isWhitespace()) j++
                out.append(text, i, j)
                sentenceStart = j
                i = if (j == i) j + 1 else j
                continue
            }
            i++
        }
        return out.toString()
    }

    /** Whether the text right before [index] is `[.!?]+['")\]]*`. */
    private fun endsSentence(text: String, index: Int): Boolean {
        var k = index - 1
        while (k >= 0 && text[k] in "'\")]") k--
        return k >= 0 && text[k] in ".!?"
    }

    private fun capitaliseSentence(sentence: String, blocked: List<String>): String {
        if (sentence.isEmpty()) return sentence
        val lower = sentence.lowercase()
        if (blocked.any { lower.startsWith(it.lowercase()) }) return sentence
        val first = sentence.codePointAt(0)
        val upper = Character.toUpperCase(first)
        if (upper == first) return sentence
        return String(Character.toChars(upper)) + sentence.substring(Character.charCount(first))
    }
}
