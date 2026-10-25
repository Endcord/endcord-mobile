/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.polishwording

import android.content.Context
import com.aliucord.entities.PluginSetting
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.composercommon.OutgoingMessages
import java.util.regex.Matcher
import java.util.regex.Pattern

internal class PolishWording : ComposerPlugin(
    name = "PolishWording",
    description = "Tweaks your messages to make them look nicer and have better grammar. See settings",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat")

    override val settingsSchema = listOf(
        PluginSetting.Switch("quickDisable", "Quick disable. Turns off message modifying without requiring a client reload.", default = false),
        PluginSetting.Text("blockedWords", "Words that will not be capitalized (comma separated)."),
        PluginSetting.Switch("fixApostrophes", "Ensure contractions contain apostrophes.", default = true),
        PluginSetting.Switch("expandContractions", "Expand contractions.", default = false),
        PluginSetting.Switch("fixCapitalization", "Capitalize sentences.", default = false),
        PluginSetting.Switch("fixPunctuation", "Punctate sentences.", default = false),
        PluginSetting.Number(
            "fixPunctuationFrequency",
            "Percent period frequency (this majorly annoys some people).",
            default = 100,
            min = 0,
            max = 100,
        ),
    )

    override fun start(context: Context) {
        onOutgoing(OutgoingMessages.Priority.STYLE) { message ->
            if (message.content.isNotEmpty()) message.content = process(message.content)
        }
    }

    private fun process(input: String): String {
        if (bool("quickDisable")) return input

        // Keep code blocks out of the formatters
        val codeBlocks = ArrayList<String>()
        var text = replace(CODE_BLOCK, input) { m ->
            codeBlocks += m.group()
            "__CODE_BLOCK_${codeBlocks.size - 1}__"
        }

        // When expanding contractions, fix them first
        if (bool("fixApostrophes") || bool("expandContractions")) text = ensureApostrophe(text)
        if (bool("fixCapitalization")) text = capitalize(text)
        if (bool("fixPunctuation") && Math.random() * 100 < int("fixPunctuationFrequency")) text = addPeriods(text)
        if (bool("expandContractions")) text = expandContractions(text)

        return replace(CODE_BLOCK_PLACEHOLDER, text) { m -> codeBlocks.getOrNull(m.group(1)!!.toInt()) ?: m.group() }
    }

    private fun ensureApostrophe(text: String): String = replace(MISSING_APOSTROPHE, text) { m ->
        val match = m.group()
        MISSING_APOSTROPHE_MAP[match.lowercase()]?.let { restoreCap(it, capData(match)) } ?: match
    }

    private fun expandContractions(text: String): String = replace(CONTRACTION, text) { m ->
        val match = m.group()
        CONTRACTIONS[match.lowercase()]?.let { restoreCap(it, capData(match)) } ?: match
    }

    private fun capitalize(text: String): String {
        val blocked = string("blockedWords").split(BLOCKED_SPLIT).filter { it.isNotEmpty() }.map { it.lowercase() }

        // Split into sentences and the whitespace between them, keeping both
        val parts = ArrayList<String>()
        val matcher = SENTENCE_SPLIT.matcher(text)
        var last = 0
        while (matcher.find()) {
            parts += text.substring(last, matcher.start())
            parts += matcher.group()
            last = matcher.end()
        }
        parts += text.substring(last)

        val result = StringBuilder(text.length)
        for (part in parts) {
            if (part.isEmpty()) continue
            if (part.isBlank()) {
                result.append(part)
                continue
            }
            val firstWord = FIRST_WORD.matcher(part).let { if (it.find()) it.group(1)!!.lowercase() else "" }
            val isBlocked = firstWord.isNotEmpty() && firstWord in blocked
            if (!isBlocked && !part.startsWith("http")) {
                result.append(replace(FIRST_CHAR, part, once = true) { m -> m.group(1)!! + m.group(2)!!.uppercase() })
            } else {
                result.append(part)
            }
        }

        return replace(LONE_I, result.toString()) { "I" }
    }

    private fun addPeriods(text: String): String {
        if (text.isEmpty()) return ""
        val lines = text.split("\n")
        val processed = ArrayList<String>(lines.size)
        for ((i, line) in lines.withIndex()) {
            val stripped = line.trimEnd()
            if (stripped.isEmpty()) {
                if (i < lines.size - 1) processed += ""
            } else if (stripped.last().let { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' } && !ENDS_WITH_URL.matcher(stripped).find()) {
                processed += "$stripped."
            } else {
                processed += stripped
            }
        }
        return processed.joinToString("\n")
    }

    /** For every ASCII letter of [str], whether it is uppercase. */
    private fun capData(str: String): BooleanArray {
        val result = ArrayList<Boolean>(str.length)
        for (c in str) if (c in 'a'..'z' || c in 'A'..'Z') result += c.isUpperCase()
        return result.toBooleanArray()
    }

    /** Applies [data] to the letters of [str], reusing the last value once [data] runs out. */
    private fun restoreCap(str: String, data: BooleanArray): String {
        val out = StringBuilder(str.length)
        var index = 0
        for (c in str) {
            if (!(c in 'a'..'z' || c in 'A'..'Z')) {
                out.append(c)
                continue
            }
            val upper = data.getOrElse(index) { false }
            out.append(if (upper) c.uppercaseChar() else c.lowercaseChar())
            if (index < data.size - 1) index++
        }
        return out.toString()
    }

    private inline fun replace(pattern: Pattern, text: String, once: Boolean = false, block: (Matcher) -> String): String {
        val matcher = pattern.matcher(text)
        if (!matcher.find()) return text
        val out = StringBuilder(text.length + 16)
        var last = 0
        do {
            out.append(text, last, matcher.start())
            out.append(block(matcher))
            last = matcher.end()
        } while (!once && matcher.find())
        out.append(text, last, text.length)
        return out.toString()
    }

    private companion object {
        val CONTRACTIONS = linkedMapOf(
            "wasn't" to "was not", "can't" to "cannot", "don't" to "do not", "won't" to "will not",
            "isn't" to "is not", "aren't" to "are not", "haven't" to "have not", "hasn't" to "has not",
            "hadn't" to "had not", "doesn't" to "does not", "didn't" to "did not", "shouldn't" to "should not",
            "wouldn't" to "would not", "couldn't" to "could not", "that's" to "that is", "what's" to "what is",
            "there's" to "there is", "how's" to "how is", "where's" to "where is", "when's" to "when is",
            "who's" to "who is", "why's" to "why is", "you'll" to "you will", "i'll" to "I will",
            "they'll" to "they will", "it'll" to "it will", "i'm" to "I am", "you're" to "you are",
            "they're" to "they are", "he's" to "he is", "she's" to "she is", "i've" to "I have",
            "you've" to "you have", "we've" to "we have", "they've" to "they have", "you'd" to "you would",
            "he'd" to "he would", "she'd" to "she would", "it'd" to "it would", "we'd" to "we would",
            "they'd" to "they would", "y'all" to "you all", "here's" to "here is",
        )

        val MISSING_APOSTROPHE_MAP: Map<String, String> = LinkedHashMap<String, String>().apply {
            for (contraction in CONTRACTIONS.keys) put(contraction.lowercase().replace("'", ""), contraction)
        }

        val MISSING_APOSTROPHE: Pattern = Pattern.compile(
            "\\b(" + MISSING_APOSTROPHE_MAP.keys.joinToString("|") { Pattern.quote(it) } + ")\\b",
            Pattern.CASE_INSENSITIVE,
        )
        val CONTRACTION: Pattern = Pattern.compile(
            "\\b(" + CONTRACTIONS.keys.joinToString("|") { Pattern.quote(it) } + ")\\b",
            Pattern.CASE_INSENSITIVE,
        )

        val CODE_BLOCK: Pattern = Pattern.compile("```[\\s\\S]*?```|`[\\s\\S]*?`")
        val CODE_BLOCK_PLACEHOLDER: Pattern = Pattern.compile("__CODE_BLOCK_(\\d+)__")
        val SENTENCE_SPLIT: Pattern =
            Pattern.compile("(?<!\\w\\.\\w.)(?<!\\b[A-Z][a-z]\\.)(?<![A-Z]\\.)(?<!\\.)(?<=[.?!])\\s+|\\n+")
        val FIRST_WORD: Pattern = Pattern.compile("^\\s*([\\w'-]+)")
        val FIRST_CHAR: Pattern = Pattern.compile("^(\\s*)(\\S)")
        val LONE_I: Pattern = Pattern.compile("\\bi\\b(?!\\s+is\\b)(?=['\\s]|$)")
        val ENDS_WITH_URL: Pattern = Pattern.compile("https?://\\S+$|www\\.\\S+$")
        val BLOCKED_SPLIT = Regex(",\\s?")
    }
}
