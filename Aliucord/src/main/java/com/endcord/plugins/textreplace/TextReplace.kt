/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.textreplace

import android.app.AlertDialog
import android.content.Context
import android.text.Editable
import android.text.TextWatcher
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.utils.DimenUtils
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.api.OutgoingMessages
import java.util.regex.Matcher
import java.util.regex.Pattern

internal class TextReplace : ComposerPlugin(
    name = "TextReplace",
    description = "Replace text in your messages. You can find pre-made rules in the #textreplace-rules channel in Endcord's Server",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "customisation", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            key = "stringRules",
            label = "Simple Replacements",
            description = "Simple find and replace rules. For example, find 'brb' and replace it with 'be right back'",
            placeholder = "brb => be right back",
            multiline = true,
        ),
        PluginSetting.Text(
            key = "regexRules",
            label = "Regex Replacements",
            description = "More powerful replacements using Regular Expressions. This section is for advanced users. If you don't understand it, just ignore it",
            placeholder = "/\\bteh\\b/gi => the",
            multiline = true,
        ),
        PluginSetting.Action(
            key = "tester",
            label = "Rule Tester",
            description = "One rule per line, written as find => replace. Add => text at the end to only apply the rule when the message includes that text. Write \\n for a new line.",
        ) { openTester(it) },
    )

    private class Rule(val find: String, val replace: String, val onlyIfIncludes: String)

    override fun start(context: Context) {
        onOutgoing(OutgoingMessages.Priority.REPLACE) { message ->
            // Channel used for sharing rules, applying rules there would be messy
            if (message.channelId == TEXT_REPLACE_RULES_CHANNEL_ID) return@onOutgoing
            message.content = applyRules(message.content)
        }
    }

    /** One rule per line, `find => replace` or `find => replace => only if includes`. Spaces are kept as typed. */
    private fun parseRules(key: String): List<Rule> = string(key).split('\n').mapNotNull { line ->
        val parts = line.split(" => ")
        val find = parts[0]
        if (find.isBlank()) return@mapNotNull null
        Rule(
            find = find,
            replace = parts.getOrNull(1)?.replace("\\n", "\n") ?: "",
            onlyIfIncludes = parts.getOrNull(2) ?: "",
        )
    }

    private fun applyRules(input: String): String {
        if (input.isEmpty()) return input
        var content = input

        for (rule in parseRules("stringRules")) {
            if (rule.onlyIfIncludes.isNotEmpty() && !content.contains(rule.onlyIfIncludes)) continue
            // Padding lets rules such as " brb " match at the start and end of the message
            content = " $content ".replace(rule.find, rule.replace).replace(EDGE_SPACE, "")
        }

        for (rule in parseRules("regexRules")) {
            if (rule.onlyIfIncludes.isNotEmpty() && !content.contains(rule.onlyIfIncludes)) continue
            try {
                val (pattern, global) = compile(rule.find)
                val matcher = pattern.matcher(content)
                val replacement = toJavaReplacement(rule.replace)
                content = if (global) matcher.replaceAll(replacement) else matcher.replaceFirst(replacement)
            } catch (e: Throwable) {
                logger.error("Invalid regex: ${rule.find}", e)
            }
        }

        return content.trim()
    }

    /** Turns `/pattern/flags` (or a bare pattern, which is global) into a Java pattern, like Endcord PC. */
    private fun compile(find: String): Pair<Pattern, Boolean> {
        val match = REGEX_LITERAL.matcher(find)
        if (!match.matches()) return Pattern.compile(find) to false
        val flags = match.group(3) ?: "g"
        var javaFlags = 0
        if ('i' in flags) javaFlags = javaFlags or Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE
        if ('m' in flags) javaFlags = javaFlags or Pattern.MULTILINE
        if ('s' in flags) javaFlags = javaFlags or Pattern.DOTALL
        return Pattern.compile(match.group(2)!!, javaFlags) to ('g' in flags)
    }

    /** JavaScript replacement syntax (`$&`, `$1`, `$$`, literal backslashes) to Java's. */
    private fun toJavaReplacement(js: String): String {
        val out = StringBuilder(js.length + 8)
        var i = 0
        while (i < js.length) {
            val c = js[i]
            when {
                c == '\\' -> out.append("\\\\")
                c == '$' && i + 1 < js.length && js[i + 1] == '&' -> {
                    out.append("$0")
                    i++
                }
                c == '$' && i + 1 < js.length && js[i + 1].isDigit() -> out.append('$')
                c == '$' && i + 1 < js.length && js[i + 1] == '$' -> {
                    out.append("\\$")
                    i++
                }
                c == '$' -> out.append(Matcher.quoteReplacement("$"))
                else -> out.append(c)
            }
            i++
        }
        return out.toString()
    }

    private fun openTester(context: Context) {
        val padding = DimenUtils.defaultPadding
        val input = EditText(context).apply { hint = I18n.t("Type a message to test rules on") }
        val output = TextView(context).apply {
            hint = I18n.t("Message with rules applied")
            setPadding(0, padding, 0, 0)
            setTextIsSelectable(true)
        }
        input.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                output.text = applyRules(s?.toString() ?: "")
            }

            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })
        val layout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding, padding, 0)
            addView(input)
            addView(output)
        }
        AlertDialog.Builder(context)
            .setTitle(I18n.t("Rule Tester"))
            .setView(layout)
            .setPositiveButton(android.R.string.ok, null)
            .show()
    }

    private companion object {
        const val TEXT_REPLACE_RULES_CHANNEL_ID = 1102784112584040479L
        val EDGE_SPACE = Regex("^\\s|\\s$")
        val REGEX_LITERAL: Pattern = Pattern.compile("^(/)?(.+?)(?:/([gimsuyv]*))?$", Pattern.DOTALL)
    }
}
