/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.urlhighlighter

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.discord.utilities.spans.BlockBackgroundSpan
import com.discord.utilities.spans.TypefaceSpanCompat
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import java.util.regex.Pattern

internal class UrlHighlighter : EndcordPlugin(
    name = "UrlHighlighter",
    description = "Highlights URLs in messages that match your patterns.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "customisation")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            key = "patterns",
            label = "URL patterns to highlight using glob patterns.",
            description = "One per line: a pattern, optionally followed by a color, like *.example.com #eb7396",
            placeholder = "*.example.com #eb7396",
            multiline = true,
        ),
        PluginSetting.Switch("boldUrls", "Make highlighted URLs bold."),
    )

    private class Rule(val regex: Pattern, val color: Int)

    private var rulesSource: String? = null
    private var rules: List<Rule> = emptyList()

    /** Parses the patterns setting, only when it changed. */
    private fun rules(): List<Rule> {
        val raw = string("patterns")
        if (raw == rulesSource) return rules
        val parsed = ArrayList<Rule>()
        for (line in raw.split('\n')) {
            // java.util.regex: Discord's copy of kotlin.text.Regex has no split() at runtime
            val parts = WHITESPACE.split(line.trim()).toList()
            val glob = parts.getOrNull(0)?.trim().orEmpty()
            if (glob.isEmpty()) continue
            val color = parts.getOrNull(1)?.let { parseColor(it) } ?: DEFAULT_COLOR
            parsed += Rule(globToRegex(glob), color)
        }
        rules = parsed
        rulesSource = raw
        return parsed
    }

    private fun parseColor(value: String): Int? = try {
        Color.parseColor(if (value.startsWith("#")) value else "#$value")
    } catch (_: IllegalArgumentException) {
        null
    }

    /** Endcord PC's globToRegex: `*` is anything, `?` one character, matched anywhere in the URL. */
    private fun globToRegex(glob: String): Pattern {
        val out = StringBuilder()
        for (c in glob) when (c) {
            '*' -> out.append(".*")
            '?' -> out.append('.')
            '.', '+', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\' -> out.append('\\').append(c)
            else -> out.append(c)
        }
        return Pattern.compile(out.toString(), Pattern.CASE_INSENSITIVE)
    }

    private val decorator = object : ChatDecorator(name, priority = 30) {
        override fun decorateText(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, text: SpannableStringBuilder) {
            val content = entry.message.content ?: return
            if (!content.contains("http", ignoreCase = true)) return
            val rules = rules()
            if (rules.isEmpty()) return

            val bold = bool("boldUrls")
            val matcher = URL.matcher(text)
            while (matcher.find()) {
                val start = matcher.start()
                val end = matcher.end()
                // Links in code are plain text, not links
                if (text.getSpans(start, end, TypefaceSpanCompat::class.java).isNotEmpty() ||
                    text.getSpans(start, end, BlockBackgroundSpan::class.java).isNotEmpty()
                ) continue
                val url = matcher.group()
                val rule = rules.firstOrNull { it.regex.matcher(url).find() } ?: continue
                text.setSpan(ForegroundColorSpan(rule.color), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                if (bold) text.setSpan(StyleSpan(Typeface.BOLD), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        }
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        rulesSource = null
        rules = emptyList()
        super.stop(context)
    }

    private companion object {
        val DEFAULT_COLOR = Color.parseColor("#eb7396")
        val WHITESPACE: Pattern = Pattern.compile("\\s+")

        /** Discord's own URL rule. */
        val URL: Pattern = Pattern.compile("https?://[^\\s<]+[^<.,:;\"')\\]\\s]")
    }
}
