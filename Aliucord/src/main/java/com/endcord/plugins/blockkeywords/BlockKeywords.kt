/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.blockkeywords

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.wrappers.embeds.MessageEmbedWrapper.Companion.description
import com.aliucord.wrappers.embeds.MessageEmbedWrapper.Companion.title
import com.discord.models.message.Message
import com.endcord.plugins.messagesacommon.ChatListFilter
import java.util.regex.Pattern
import java.util.regex.PatternSyntaxException

internal class BlockKeywords : EndcordPlugin(
    name = "BlockKeywords",
    description = "Hides messages containing specific user-defined keywords from the chat.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "customisation", "privacy")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            key = "blockedWords",
            label = "Blocked Words",
            description = "Comma-separated list of words to block",
            multiline = true,
        ),
        PluginSetting.Switch(
            key = "useRegex",
            label = "Use Regex",
            description = "Use each value as a regular expression when checking message content (advanced)",
        ),
        PluginSetting.Switch(
            key = "caseSensitive",
            label = "Case Sensitive",
            description = "Whether to use a case sensitive search or not",
        ),
    )

    /** The compiled patterns and the settings they were compiled from. */
    @Volatile
    private var compiled: Pair<String, List<Pattern>>? = null

    override fun start(context: Context) {
        ChatListFilter.addMessageFilter(name) { message -> containsBlockedKeywords(message) }
    }

    override fun stop(context: Context) {
        ChatListFilter.unregisterAll(name)
        compiled = null
        super.stop(context)
    }

    private fun patterns(): List<Pattern> {
        val words = string("blockedWords")
        val regex = bool("useRegex")
        val caseSensitive = bool("caseSensitive")
        val key = "$regex|$caseSensitive|$words"
        compiled?.let { if (it.first == key) return it.second }

        val flags = if (caseSensitive) 0 else Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE
        val list = splitPatterns(words).mapNotNull { word ->
            try {
                if (regex) Pattern.compile(word, flags) else Pattern.compile("\\b" + Pattern.quote(word) + "\\b", flags)
            } catch (e: PatternSyntaxException) {
                logger.warn("Ignoring invalid pattern $word: ${e.description}")
                null
            }
        }
        compiled = key to list
        return list
    }

    private fun containsBlockedKeywords(message: Message): Boolean {
        val patterns = patterns()
        if (patterns.isEmpty()) return false

        fun matches(text: String?) = text != null && text.isNotEmpty() && patterns.any { it.matcher(text).find() }

        if (matches(message.content)) return true
        return message.embeds?.any { matches(it.description) || matches(it.title) } == true
    }

    private companion object {
        /** Splits on commas, except commas inside `[...]` and `{n,m}` so regular expressions survive. */
        fun splitPatterns(input: String): List<String> {
            val out = ArrayList<String>()
            val current = StringBuilder()
            var inClass = false
            var inBraces = false
            for (c in input) {
                when {
                    c == '[' -> inClass = true
                    c == ']' -> inClass = false
                    c == '{' -> inBraces = true
                    c == '}' -> inBraces = false
                }
                if ((c == ',' || c == '\n') && !inClass && !inBraces) {
                    out += current.toString()
                    current.setLength(0)
                } else {
                    current.append(c)
                }
            }
            out += current.toString()
            return out.map { it.trim() }.filter { it.isNotEmpty() }
        }
    }
}
