/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagecolors

import android.content.Context
import android.graphics.Color
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.messagesbcommon.ChatDecorator
import com.endcord.plugins.messagesbcommon.ChatHooks
import com.endcord.plugins.messagesbcommon.ColorBlockSpan
import com.endcord.plugins.messagesbcommon.isCodeOrLink
import java.util.Locale
import java.util.regex.Pattern
import kotlin.math.roundToInt

internal class MessageColors : EndcordPlugin(
    name = "MessageColors",
    description = "Displays color codes like #FF0042 inside of messages",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "chat")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            key = "renderType",
            label = "How to render colors",
            options = listOf(
                PluginSetting.Choice.Option(FOREGROUND, "Text color"),
                PluginSetting.Choice.Option(BLOCK, "Colored block next to it"),
                PluginSetting.Choice.Option(BACKGROUND, "Background color"),
            ),
        ),
        PluginSetting.Switch("enableShortHexCodes", "Enable 3 char hex-code like #39f", default = true),
        PluginSetting.Choice(
            key = "blockView",
            label = "Where to display colored block",
            options = listOf(
                PluginSetting.Choice.Option(RIGHT, "Right side"),
                PluginSetting.Choice.Option(LEFT, "Left side"),
                PluginSetting.Choice.Option(BOTH, "Both sides"),
            ),
        ),
    )

    private class Found(val start: Int, val end: Int, val color: Int)

    private val decorator = object : ChatDecorator(name, priority = 10) {
        override fun decorateText(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, text: SpannableStringBuilder) {
            val content = entry.message.content ?: return
            // Endcord PC's requiredFirstCharacters
            if (content.indexOf('#') < 0 && !content.contains("rgb", ignoreCase = true) && !content.contains("hsl", ignoreCase = true)) return

            val pattern = if (bool("enableShortHexCodes")) PATTERN_SHORT else PATTERN_LONG
            val matcher = pattern.matcher(text)
            var found: ArrayList<Found>? = null
            while (matcher.find()) {
                val start = matcher.start()
                val end = matcher.end()
                if (text.isCodeOrLink(start, end)) continue
                val color = parseColor(matcher.group()) ?: continue
                (found ?: ArrayList<Found>(2).also { found = it }) += Found(start, end, color)
            }
            val list = found ?: return

            val renderType = choice("renderType")
            val margin = (holder.itemView.resources.displayMetrics.density * 2).roundToInt()
            // From the end, because blocks insert characters
            for (i in list.indices.reversed()) {
                val f = list[i]
                when (renderType) {
                    BACKGROUND -> {
                        text.setSpan(BackgroundColorSpan(f.color), f.start, f.end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                        // Light colors get dark text and the other way around, like Endcord PC
                        val textColor = if (isDark(f.color)) Color.WHITE else Color.BLACK
                        text.setSpan(ForegroundColorSpan(textColor), f.start, f.end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    }
                    BLOCK -> {
                        val view = choice("blockView")
                        if (view == RIGHT || view == BOTH) insertBlock(text, f.end, f.color, margin, 0)
                        if (view == LEFT || view == BOTH) insertBlock(text, f.start, f.color, 0, margin)
                    }
                    else -> text.setSpan(ForegroundColorSpan(f.color), f.start, f.end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                }
            }
        }
    }

    private fun insertBlock(text: SpannableStringBuilder, at: Int, color: Int, marginStart: Int, marginEnd: Int) {
        text.insert(at, " ")
        text.setSpan(ColorBlockSpan(color, marginStart, marginEnd), at, at + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }

    /** Relative luminance below Endcord PC's border of 115. */
    private fun isDark(color: Int): Boolean =
        0.2126 * Color.red(color) + 0.7152 * Color.green(color) + 0.0722 * Color.blue(color) < 115

    /** Parses a color code the way Endcord PC's parseColor and CSS read it. */
    private fun parseColor(raw: String): Int? = try {
        val str = raw.lowercase(Locale.ROOT).trim()
        when {
            str.startsWith("#") -> {
                var hex = str.substring(1)
                if (hex.length == 3) hex = buildString { for (c in hex) append(c).append(c) }
                Color.rgb(hex.substring(0, 2).toInt(16), hex.substring(2, 4).toInt(16), hex.substring(4, 6).toInt(16))
            }
            str.startsWith("hsl") -> {
                val n = NUMBER.matcher(str).let { m -> ArrayList<Float>(3).apply { while (m.find()) add(m.group().toFloat()) } }
                hslToRgb(n[0], n[1] / 100f, n[2] / 100f)
            }
            else -> {
                val n = NUMBER.matcher(str).let { m -> ArrayList<Float>(4).apply { while (m.find()) add(m.group().toFloat()) } }
                val r = n[0].coerceIn(0f, 255f).toInt()
                val g = n[1].coerceIn(0f, 255f).toInt()
                val b = n[2].coerceIn(0f, 255f).toInt()
                val a = if (str.startsWith("rgba") && n.size > 3) (n[3].coerceIn(0f, 1f) * 255).roundToInt() else 255
                Color.argb(a, r, g, b)
            }
        }
    } catch (e: Throwable) {
        null
    }

    private fun hslToRgb(hue: Float, saturation: Float, lightness: Float): Int {
        val h = ((hue % 360) + 360) % 360
        val s = saturation.coerceIn(0f, 1f)
        val l = lightness.coerceIn(0f, 1f)
        val c = (1 - kotlin.math.abs(2 * l - 1)) * s
        val x = c * (1 - kotlin.math.abs(h / 60 % 2 - 1))
        val m = l - c / 2
        val (r, g, b) = when {
            h < 60 -> Triple(c, x, 0f)
            h < 120 -> Triple(x, c, 0f)
            h < 180 -> Triple(0f, c, x)
            h < 240 -> Triple(0f, x, c)
            h < 300 -> Triple(x, 0f, c)
            else -> Triple(c, 0f, x)
        }
        return Color.rgb(((r + m) * 255).roundToInt(), ((g + m) * 255).roundToInt(), ((b + m) * 255).roundToInt())
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        super.stop(context)
    }

    private companion object {
        const val FOREGROUND = "foreground"
        const val BLOCK = "block"
        const val BACKGROUND = "background"
        const val RIGHT = "right"
        const val LEFT = "left"
        const val BOTH = "both"

        // Endcord PC's regexes with its \v (value), \c (comma) and \f (float) shorthands expanded
        private const val V = "\\s*?\\d+?\\s*?"
        private const val C = "(?:,|\\s)"
        private const val F = "[+-]?(?:[0-9]*[.])?[0-9]+"
        private const val RGB = "rgb\\($V$C$V$C$V\\)"
        private const val RGBA = "rgba\\($V$C$V$C$V(?:$C|/?)\\s*$F\\)"
        private const val HSL = "hsl\\($V°?$C\\s*?\\d+%?\\s*?$C\\s*?\\d+%?\\s*?\\)"

        val PATTERN_SHORT: Pattern = Pattern.compile("$RGB|$RGBA|$HSL|#(?:[0-9a-fA-F]{3}){1,2}", Pattern.CASE_INSENSITIVE)
        val PATTERN_LONG: Pattern = Pattern.compile("$RGB|$RGBA|$HSL|#(?:[0-9a-fA-F]{3}){2}", Pattern.CASE_INSENSITIVE)
        val NUMBER: Pattern = Pattern.compile("[+-]?(?:[0-9]*[.])?[0-9]+")
    }
}
