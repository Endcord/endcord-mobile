/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.calculator

import android.content.Context
import com.aliucord.api.CommandsAPI
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.tr
import java.math.BigDecimal
import java.util.regex.Pattern
import kotlin.math.abs

internal class Calculator : EndcordPlugin(
    name = "Calculator",
    description = "/calc does quick maths right in the chat box.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility", "commands")

    // Same whitelist as Endcord PC. Spelled out instead of \d and \s, which match non-ASCII characters on Android.
    private val allowed = Pattern.compile("^[0-9 \\t\\n\\r+\\-*/().%]+$")

    override fun start(context: Context) {
        commands.registerCommand(
            "calc",
            "Evaluate a maths expression (+ - * / % and parentheses)",
            CommandsAPI.requiredMessageOption,
        ) { ctx ->
            val expr = ctx.getRequiredString("message")
            if (!allowed.matcher(expr).matches()) {
                return@registerCommand CommandResult(tr("Only numbers and + - * / % ( ) are allowed."), null, false)
            }
            val result = try {
                Parser(expr).parse()
            } catch (_: IllegalArgumentException) {
                Double.NaN
            } catch (_: StackOverflowError) {
                Double.NaN
            }
            if (result.isNaN() || result.isInfinite()) {
                CommandResult(tr("Couldn't work that one out."), null, false)
            } else {
                CommandResult("`${expr.trim()}` = **${format(result)}**", null, true)
            }
        }
    }

    /** Prints a number the way JavaScript does: no trailing ".0", plain digits for everyday magnitudes. */
    private fun format(d: Double): String {
        val a = abs(d)
        if (d == Math.rint(d) && a < 1e15) return d.toLong().toString()
        if (a >= 1e21 || a < 1e-6) {
            // Double.toString gives e.g. "1.0E21"; JavaScript writes "1e+21"
            val (mantissa, exp) = d.toString().split('E').let { it[0] to it.getOrElse(1) { "0" } }
            val m = mantissa.removeSuffix(".0")
            return if (exp.startsWith("-")) "${m}e$exp" else "${m}e+$exp"
        }
        return BigDecimal(d.toString()).stripTrailingZeros().toPlainString()
    }

    /**
     * Recursive descent parser for the whitelisted maths: + - * / %, ** for powers, unary minus and
     * parentheses, with JavaScript's precedence. Throws [IllegalArgumentException] on malformed input.
     */
    private class Parser(private val s: String) {
        private var pos = 0

        fun parse(): Double {
            val value = expression()
            skipSpaces()
            require(pos == s.length)
            return value
        }

        private fun expression(): Double {
            var value = term()
            while (true) {
                skipSpaces()
                value = when (peek()) {
                    '+' -> { pos++; value + term() }
                    '-' -> { pos++; value - term() }
                    else -> return value
                }
            }
        }

        private fun term(): Double {
            var value = unary()
            while (true) {
                skipSpaces()
                val c = peek()
                if (c == '*' && peek(1) == '*') return value
                value = when (c) {
                    '*' -> { pos++; value * unary() }
                    '/' -> { pos++; value / unary() }
                    '%' -> { pos++; value % unary() }
                    else -> return value
                }
            }
        }

        private fun unary(): Double {
            skipSpaces()
            return when (peek()) {
                '-' -> { pos++; -unary() }
                '+' -> { pos++; unary() }
                else -> power()
            }
        }

        private fun power(): Double {
            val base = primary()
            skipSpaces()
            if (peek() == '*' && peek(1) == '*') {
                pos += 2
                return Math.pow(base, unary())
            }
            return base
        }

        private fun primary(): Double {
            skipSpaces()
            if (peek() == '(') {
                pos++
                val value = expression()
                skipSpaces()
                require(peek() == ')')
                pos++
                return value
            }
            val start = pos
            var dots = 0
            var digits = 0
            while (pos < s.length) {
                val c = s[pos]
                if (c == '.') dots++ else if (c in '0'..'9') digits++ else break
                pos++
            }
            require(digits > 0 && dots <= 1)
            return s.substring(start, pos).toDouble()
        }

        private fun peek(offset: Int = 0): Char? = s.getOrNull(pos + offset)

        private fun skipSpaces() {
            while (pos < s.length && s[pos].isWhitespace()) pos++
        }
    }
}
