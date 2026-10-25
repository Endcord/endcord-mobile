/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagesbcommon

import java.util.regex.Pattern

/** Finds code blocks in raw message markdown the way Discord's Android parser does. */
internal object CodeBlocks {
    /** Discord's code block rule (`b.a.t.a.e`), unanchored. Group 3 is the code. */
    @JvmField
    val PATTERN: Pattern = Pattern.compile("```(?:([\\w+\\-.]+?)?(\\s*\\n))?([^\\n].*?)\\n*```", Pattern.DOTALL)

    /** Quick check before running [PATTERN]. */
    @JvmStatic
    fun mayContain(content: String): Boolean {
        val first = content.indexOf("```")
        return first >= 0 && content.indexOf("```", first + 3) > 0
    }

    /**
     * Endcord PC's Unindent: turns tabs into four spaces, then removes the indentation every non-blank line
     * shares.
     */
    @JvmStatic
    fun unindent(input: String): String {
        val str = if (input.indexOf('\t') >= 0) input.replace("\t", "    ") else input
        val lines = str.split('\n')
        var min = Int.MAX_VALUE
        for (line in lines) {
            var spaces = 0
            while (spaces < line.length && line[spaces] == ' ') spaces++
            if (spaces < line.length && !line[spaces].isWhitespace() && spaces < min) min = spaces
        }
        if (min == Int.MAX_VALUE || min == 0) return str

        val out = StringBuilder(str.length)
        lines.forEachIndexed { i, line ->
            if (i > 0) out.append('\n')
            var spaces = 0
            while (spaces < min && spaces < line.length && line[spaces] == ' ') spaces++
            out.append(line, if (spaces == min) min else 0, line.length)
        }
        return out.toString()
    }
}
