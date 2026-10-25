/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.fixcodeblockgap

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.messagesbcommon.CodeBlocks

/**
 * Discord renders a code block as its own paragraph that already ends with a line break, and its code block
 * rule leaves the newline after the closing fence for the text that follows, which shows up as an empty
 * line. Like Endcord PC's patch to that rule, this drops one newline right after each code block.
 */
internal class FixCodeblockGap : EndcordPlugin(
    name = "FixCodeblockGap",
    description = "Removes the gap between codeblocks and text below it",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance")

    private val decorator = object : ChatDecorator(name, priority = -5) {
        override fun transformContent(entry: MessageEntry, content: String): String {
            if (!CodeBlocks.mayContain(content)) return content
            val matcher = CodeBlocks.PATTERN.matcher(content)
            var out: StringBuilder? = null
            var last = 0
            while (matcher.find()) {
                val end = matcher.end()
                if (end >= content.length || content[end] != '\n') continue
                // Quotes, lists and headers only parse at the start of a line, so keep their line break
                val next = if (end + 1 < content.length) content[end + 1] else '\n'
                if (next == '>' || next == '#' || next == '-' || next == '*' || next == ' ') continue
                val builder = out ?: StringBuilder(content.length).also { out = it }
                builder.append(content, last, end)
                last = end + 1
            }
            val builder = out ?: return content
            return builder.append(content, last, content.length).toString()
        }
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        super.stop(context)
    }
}
