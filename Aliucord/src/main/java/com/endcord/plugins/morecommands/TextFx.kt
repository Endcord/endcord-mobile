/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.morecommands

import com.endcord.plugins.commandscommon.Patterns
import java.util.regex.Pattern
import kotlin.random.Random

/** The text transformations behind /uwuify, /mock, /freaky and /morse, matching Endcord PC's output. */
internal object TextFx {
    private val tokens = Pattern.compile("\\S+|\\s+")
    private val nBeforeVowel = Pattern.compile("n(?=[aeo])")
    private val lOrR = Pattern.compile("[lr]")

    private val endings = arrayOf(
        "rawr x3", "OwO", "UwU", "o.O", "-.-", ">w<", "(⑅˘꒳˘)", "(ꈍᴗꈍ)", "(˘ω˘)", "(U ᵕ U❁)", "σωσ", "òωó",
        "(///ˬ///✿)", "(U ﹏ U)", "( ͡o ω ͡o )", "ʘwʘ", ":3", ":3", ":3", "XD", "nyaa~~", "mya", ">_<", "😳",
        "🥺", "😳😳😳", "rawr", "^^", "^^;;", "(ˆ ﻌ ˆ)♡", "^•ﻌ•^", "/(^•ω•^)", "(✿oωo)",
    )

    private val replacements = listOf(
        "small" to "smol",
        "cute" to "kawaii",
        "fluff" to "floof",
        "love" to "luv",
        "stupid" to "baka",
        "what" to "nani",
        "meow" to "nya",
        "hello" to "hewwo",
    ).map { (from, to) -> Pattern.compile("\\b$from\\b", Pattern.CASE_INSENSITIVE) to to }

    fun uwuify(message: String): String {
        val sb = StringBuilder(message.length + 16)
        for (word in Patterns.findAll(tokens, message)) {
            if (isOneCharacterString(word) || word.startsWith("https://")) {
                sb.append(word)
                continue
            }
            sb.append(replaceWords(word) ?: lOrR.matcher(nBeforeVowel.matcher(word).replaceAll("ny")).replaceAll("w"))
        }
        if (sb.isEmpty()) return ""
        return sb.append(' ').append(endings.random()).toString()
    }

    private fun isOneCharacterString(s: String) = s.all { it == s[0] }

    /** Applies the whole word replacements, or returns null when none matched. */
    private fun replaceWords(word: String): String? {
        var result = word
        var replaced = false
        for ((pattern, to) in replacements) {
            val matcher = pattern.matcher(result)
            if (matcher.find()) {
                result = matcher.replaceAll(to)
                replaced = true
            }
        }
        return if (replaced) result else null
    }

    fun mock(input: String): String {
        val sb = StringBuilder(input.length)
        input.forEachIndexed { i, c -> sb.append(if (i % 2 == 1) c.uppercaseChar() else c.lowercaseChar()) }
        return sb.toString()
    }

    /** Rewrites letters in 𝓫𝓸𝓵𝓭 𝓼𝓬𝓻𝓲𝓹𝓽. */
    fun freaky(text: String, addEnding: Boolean): String {
        val base = text.trim().ifEmpty { "freaky" }
        val sb = StringBuilder(base.length * 2)
        for (c in base) {
            when (c) {
                in 'a'..'z' -> sb.appendCodePoint(0x1D4EA + (c - 'a'))
                in 'A'..'Z' -> sb.appendCodePoint(0x1D4D0 + (c - 'A'))
                else -> sb.append(c)
            }
        }
        if (addEnding) sb.append(if (Random.nextDouble() < 0.25) " 👅" else " ❤️")
        return sb.toString()
    }

    private val morse = mapOf(
        'A' to ".-", 'B' to "-...", 'C' to "-.-.", 'D' to "-..", 'E' to ".", 'F' to "..-.",
        'G' to "--.", 'H' to "....", 'I' to "..", 'J' to ".---", 'K' to "-.-", 'L' to ".-..",
        'M' to "--", 'N' to "-.", 'O' to "---", 'P' to ".--.", 'Q' to "--.-", 'R' to ".-.",
        'S' to "...", 'T' to "-", 'U' to "..-", 'V' to "...-", 'W' to ".--", 'X' to "-..-",
        'Y' to "-.--", 'Z' to "--..",
        '0' to "-----", '1' to ".----", '2' to "..---", '3' to "...--", '4' to "....-",
        '5' to ".....", '6' to "-....", '7' to "--...", '8' to "---..", '9' to "----.",
        ' ' to "/",
    )
    private val fromMorseMap = morse.entries.associate { (k, v) -> v to k }
    private val morseOnly = Pattern.compile("^[.\\-/ ]+$")

    fun isMorse(text: String) = morseOnly.matcher(text).matches()

    fun toMorse(text: String) = text.uppercase().map { morse[it] ?: "" }.joinToString(" ")

    fun fromMorse(text: String): String {
        val raw = text.split(' ').map { fromMorseMap[it]?.toString() ?: "" }.joinToString("").lowercase()
        return raw.replaceFirstChar { it.uppercaseChar() }
    }
}
