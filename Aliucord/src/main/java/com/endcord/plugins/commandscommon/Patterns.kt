/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.commandscommon

import java.util.regex.Matcher
import java.util.regex.Pattern

/**
 * java.util.regex helpers. Discord's jar bundles a stripped copy of `kotlin.text.Regex` that shadows the real
 * one at compile time (default arguments and RegexOption are missing), so these ports use Pattern directly.
 */
internal object Patterns {
    /** Replaces every match of [pattern] in [input] with what [transform] returns for it. */
    @JvmStatic
    inline fun replace(pattern: Pattern, input: CharSequence, transform: (Matcher) -> String): String {
        val matcher = pattern.matcher(input)
        if (!matcher.find()) return input.toString()
        val sb = StringBuffer(input.length + 16)
        do {
            matcher.appendReplacement(sb, Matcher.quoteReplacement(transform(matcher)))
        } while (matcher.find())
        matcher.appendTail(sb)
        return sb.toString()
    }

    /** Every value of [group] matched by [pattern] in [input]. */
    @JvmStatic
    fun findAll(pattern: Pattern, input: CharSequence, group: Int = 0): List<String> {
        val matcher = pattern.matcher(input)
        val result = ArrayList<String>()
        while (matcher.find()) matcher.group(group)?.let { result += it }
        return result
    }

    @JvmStatic
    fun matches(pattern: Pattern, input: CharSequence): Boolean = pattern.matcher(input).matches()

    @JvmStatic
    fun contains(pattern: Pattern, input: CharSequence): Boolean = pattern.matcher(input).find()
}
