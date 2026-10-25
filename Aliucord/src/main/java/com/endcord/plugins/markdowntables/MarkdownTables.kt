/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.markdowntables

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import java.util.regex.Pattern

/**
 * The legacy app's text views can't lay out a real table, so a GitHub-style table is redrawn as an aligned
 * monospace table inside a code block, with the header separated by a line and each column aligned the way the
 * table asks. Inline formatting inside cells is reduced to plain text, since code blocks don't render it.
 */
internal class MarkdownTables : EndcordPlugin(
    name = "MarkdownTables",
    description = "Render GitHub-style markdown tables in Discord messages.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "appearance")

    private enum class Align { LEFT, CENTER, RIGHT }

    private val decorator = object : ChatDecorator(name, priority = 10) {
        override fun transformContent(entry: MessageEntry, content: String): String {
            if (content.indexOf('|') < 0 || content.indexOf('-') < 0 || content.indexOf('\n') < 0) return content
            return try {
                render(content, entry.nickOrUsernames)
            } catch (e: Throwable) {
                logger.error("Failed to render a table", e)
                content
            }
        }
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        super.stop(context)
    }

    private fun render(content: String, names: Map<Long, String>?): String {
        val lines = content.split('\n')
        val out = StringBuilder(content.length + 64)
        var changed = false
        var fence: String? = null
        var i = 0
        while (i < lines.size) {
            val line = lines[i]
            val fenceMatch = FENCE.matcher(line)
            if (fence != null) {
                if (fenceMatch.find() && fenceMatch.group(1)!!.startsWith(fence)) fence = null
                appendLine(out, line)
                i++
                continue
            }
            if (fenceMatch.find()) {
                fence = fenceMatch.group(1)
                appendLine(out, line)
                i++
                continue
            }

            val alignments = if (i + 1 < lines.size && isTableLine(line)) separator(lines[i + 1]) else null
            val header = if (alignments != null) splitRow(line) else null
            if (alignments == null || header == null || header.size < 2) {
                appendLine(out, line)
                i++
                continue
            }

            val rows = ArrayList<List<String>>()
            var cursor = i + 2
            while (cursor < lines.size && isTableLine(lines[cursor]) && !FENCE.matcher(lines[cursor]).find()) {
                rows += splitRow(lines[cursor])
                cursor++
            }
            if (rows.isEmpty()) {
                appendLine(out, line)
                i++
                continue
            }

            appendLine(out, drawTable(header, alignments, rows, names))
            changed = true
            i = cursor
        }
        if (!changed) return content
        // appendLine adds a newline after every line; the original had none after its last one
        out.setLength(out.length - 1)
        return out.toString()
    }

    private fun appendLine(out: StringBuilder, line: String) {
        out.append(line).append('\n')
    }

    private fun drawTable(header: List<String>, alignments: List<Align>, rows: List<List<String>>, names: Map<Long, String>?): String {
        val width = alignments.size
        val table = ArrayList<List<String>>(rows.size + 1)
        table += normalise(header, width, names)
        for (row in rows) table += normalise(row, width, names)

        val widths = IntArray(width)
        for (row in table) for (c in 0 until width) widths[c] = maxOf(widths[c], length(row[c]), 1)

        val sb = StringBuilder("```\n")
        table.forEachIndexed { index, row ->
            for (c in 0 until width) {
                if (c > 0) sb.append(" │ ")
                sb.append(pad(row[c], widths[c], alignments[c], c == width - 1))
            }
            sb.append('\n')
            if (index == 0) {
                for (c in 0 until width) {
                    if (c > 0) sb.append("─┼─")
                    for (k in 0 until widths[c]) sb.append('─')
                }
                sb.append('\n')
            }
        }
        sb.append("```")
        return sb.toString()
    }

    private fun normalise(cells: List<String>, width: Int, names: Map<Long, String>?): List<String> =
        List(width) { plain(cells.getOrNull(it) ?: "", names) }

    /** Turns the inline markdown of a cell into the plain text a reader would see. */
    private fun plain(cell: String, names: Map<Long, String>?): String {
        var text = LINK.matcher(cell).replaceAll("$1")
        text = CUSTOM_EMOJI.matcher(text).replaceAll(":$1:")
        val mentions = USER_MENTION.matcher(text)
        if (mentions.find()) {
            val sb = StringBuffer()
            do {
                val id = mentions.group(1)!!.toLongOrNull()
                val name = if (id != null) names?.get(id) else null
                mentions.appendReplacement(sb, java.util.regex.Matcher.quoteReplacement(if (name != null) "@$name" else mentions.group()))
            } while (mentions.find())
            mentions.appendTail(sb)
            text = sb.toString()
        }
        text = FORMATTING.matcher(text).replaceAll("")
        return text.replace("\\|", "|").trim()
    }

    private fun length(text: String) = text.codePointCount(0, text.length)

    private fun pad(text: String, width: Int, align: Align, last: Boolean): String {
        val space = width - length(text)
        if (space <= 0) return text
        return when (align) {
            Align.LEFT -> if (last) text else text + " ".repeat(space)
            Align.RIGHT -> " ".repeat(space) + text
            Align.CENTER -> {
                val left = space / 2
                " ".repeat(left) + text + if (last) "" else " ".repeat(space - left)
            }
        }
    }

    /** Whether a line has an unescaped `|` and so could be a table row. */
    private fun isTableLine(line: String): Boolean {
        if (line.isBlank() || line.startsWith("    ") || line.startsWith("\t")) return false
        for (i in line.indices) if (line[i] == '|' && !escaped(line, i)) return true
        return false
    }

    private fun escaped(line: String, index: Int): Boolean {
        var slashes = 0
        var i = index - 1
        while (i >= 0 && line[i] == '\\') {
            slashes++
            i--
        }
        return slashes % 2 == 1
    }

    /** The column alignments of a `| --- | :---: |` line, or null when it isn't one. */
    private fun separator(line: String): List<Align>? {
        if (!isTableLine(line)) return null
        val cells = splitRow(line)
        if (cells.size < 2) return null
        return cells.map { cell ->
            val value = cell.trim()
            if (!SEPARATOR_CELL.matcher(value).matches()) return null
            when {
                value.startsWith(":") && value.endsWith(":") -> Align.CENTER
                value.endsWith(":") -> Align.RIGHT
                else -> Align.LEFT
            }
        }
    }

    private fun splitRow(line: String): List<String> {
        var row = line.trim()
        if (row.startsWith("|")) row = row.substring(1)
        if (row.endsWith("|") && !escaped(row, row.length - 1)) row = row.substring(0, row.length - 1)
        val cells = ArrayList<String>()
        val current = StringBuilder()
        for (i in row.indices) {
            val c = row[i]
            if (c == '|' && !escaped(row, i)) {
                cells += current.toString().trim()
                current.setLength(0)
            } else {
                current.append(c)
            }
        }
        cells += current.toString().trim()
        return cells
    }

    private companion object {
        val FENCE: Pattern = Pattern.compile("^ {0,3}(`{3,}|~{3,})")
        val SEPARATOR_CELL: Pattern = Pattern.compile("^:?-{3,}:?$")
        val LINK: Pattern = Pattern.compile("\\[([^\\]]+)]\\(<?[^)>\\s]+>?\\)")
        val CUSTOM_EMOJI: Pattern = Pattern.compile("<a?:(\\w+):\\d+>")
        val USER_MENTION: Pattern = Pattern.compile("<@!?(\\d+)>")
        val FORMATTING: Pattern = Pattern.compile("\\*\\*|__|~~|`")
    }
}
