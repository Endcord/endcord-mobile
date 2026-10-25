/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.unindent

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.messagesbcommon.ChatDecorator
import com.endcord.plugins.messagesbcommon.ChatHooks
import com.endcord.plugins.messagesbcommon.CodeBlocks
import com.endcord.plugins.messagesbcommon.SendHooks
import java.util.regex.Pattern

internal class Unindent : EndcordPlugin(
    name = "Unindent",
    description = "Trims leading indentation from codeblocks",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    // Shown messages: unindent the code of every code block before Discord renders it
    private val decorator = object : ChatDecorator(name, priority = -10) {
        override fun transformContent(entry: MessageEntry, content: String): String {
            if (!CodeBlocks.mayContain(content)) return content
            val matcher = CodeBlocks.PATTERN.matcher(content)
            var out: StringBuilder? = null
            var last = 0
            while (matcher.find()) {
                val code = matcher.group(3) ?: continue
                val unindented = CodeBlocks.unindent(code)
                if (unindented == code) continue
                val builder = out ?: StringBuilder(content.length).also { out = it }
                builder.append(content, last, matcher.start(3)).append(unindented)
                last = matcher.end(3)
            }
            val builder = out ?: return content
            return builder.append(content, last, content.length).toString()
        }
    }

    /** Endcord PC's unindentMsg, for messages being sent or edited. */
    private fun unindentMessage(content: String): String {
        if (!CodeBlocks.mayContain(content)) return content
        val matcher = SEND_PATTERN.matcher(content)
        val out = StringBuilder(content.length)
        var last = 0
        var changed = false
        while (matcher.find()) {
            val block = matcher.group()
            val lines = block.split('\n').toMutableList()
            if (lines.size < 2) continue // Single line code blocks are left alone
            val suffix = if (lines.last() == "```") lines.removeAt(lines.size - 1) else ""
            val replacement = StringBuilder(lines[0]).append('\n')
                .append(CodeBlocks.unindent(lines.subList(1, lines.size).joinToString("\n")))
            if (suffix.isNotEmpty()) replacement.append('\n').append(suffix)
            out.append(content, last, matcher.start()).append(replacement)
            last = matcher.end()
            if (replacement.length != block.length || replacement.toString() != block) changed = true
        }
        if (!changed) return content
        return out.append(content, last, content.length).toString()
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
        SendHooks.register(name, onEdit = true, transform = ::unindentMessage)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        SendHooks.unregisterAll(name)
        super.stop(context)
    }

    private companion object {
        val SEND_PATTERN: Pattern = Pattern.compile("```[\\s\\S]*?```")
    }
}
