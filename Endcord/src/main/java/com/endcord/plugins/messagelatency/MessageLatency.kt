/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagelatency

import android.content.Context
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.drawable.Drawable
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.widget.TextView
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.discord.models.message.Message
import com.discord.stores.StoreStream
import com.discord.utilities.color.ColorCompat
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.CenteredDrawableSpan
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.lytefast.flexinput.R
import kotlin.math.abs
import kotlin.math.floor

internal class MessageLatency : EndcordPlugin(
    name = "MessageLatency",
    description = "Displays an indicator for messages that took ≥n seconds to send",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Number("latency", "Threshold in seconds for latency indicator", default = 2, min = 0, max = 3600),
        PluginSetting.Switch("detectDiscordKotlin", "Detect old Discord Android clients", default = true),
        PluginSetting.Switch("showMillis", "Show milliseconds"),
        PluginSetting.Switch("ignoreSelf", "Don't add indicator to your own messages"),
    )

    private enum class Fill { DANGER, WARNING, POSITIVE, MUTED }

    private class Latency(val delta: Long?, val ahead: Boolean, val fill: Array<Fill>)

    private fun snowflakeTime(id: Long) = (id ushr 22) + DISCORD_EPOCH

    /** Port of Endcord PC's latencyTooltipData. */
    private fun latency(message: Message): Latency? {
        // Only messages received through the gateway carry a nonce, and bots rarely send a real one
        val nonce = message.nonce?.toLongOrNull() ?: return null
        val author = message.author ?: return null
        if (author.e() == true) return null
        if (bool("ignoreSelf") && author.id == StoreStream.getUsers().me.id) return null

        val showMillis = bool("showMillis")
        var delta = snowflakeTime(message.id) - snowflakeTime(nonce)
        if (!showMillis) delta = floor(delta / 1000.0 + 0.5).toLong() * 1000

        // Old Discord Android clients (like this one) send nonces about 17 days in the past
        var isKotlin = false
        if (-delta >= DISCORD_KT_DELAY - 86_400_000L) {
            isKotlin = bool("detectDiscordKotlin")
            delta += DISCORD_KT_DELAY
        }

        // A negative delay means the sender's clock is ahead
        val absolute = abs(delta)
        val ahead = absolute != delta
        val threshold = int("latency") * 1000L
        val shown = absolute >= threshold

        val fill = when {
            isKotlin -> arrayOf(Fill.POSITIVE, Fill.POSITIVE, Fill.MUTED)
            delta >= TROLL_LIMIT || ahead -> arrayOf(Fill.MUTED, Fill.MUTED, Fill.MUTED)
            delta >= threshold * 2 -> arrayOf(Fill.DANGER, Fill.MUTED, Fill.MUTED)
            else -> arrayOf(Fill.WARNING, Fill.WARNING, Fill.MUTED)
        }
        return if (shown || isKotlin) Latency(if (shown) absolute else null, ahead, fill) else null
    }

    /** A compact version of Endcord PC's stringDelta, since there is no tooltip to show the long one in. */
    private fun shortDelta(ms: Long, showMillis: Boolean): String {
        val parts = ArrayList<String>(2)
        val days = ms / 86_400_000L
        val hours = ms / 3_600_000L % 24
        val minutes = ms / 60_000L % 60
        val seconds = ms / 1000L % 60
        val millis = ms % 1000
        if (days > 0) parts += I18n.t("{n}d", "n" to days)
        if (hours > 0) parts += I18n.t("{n}h", "n" to hours)
        if (minutes > 0) parts += I18n.t("{n}m", "n" to minutes)
        if (seconds > 0) parts += I18n.t("{n}s", "n" to seconds)
        if (showMillis && millis > 0) parts += I18n.t("{n}ms", "n" to millis)
        if (parts.isEmpty()) return I18n.t("{n}s", "n" to 0)
        return parts.take(2).joinToString(" ")
    }

    private fun color(context: Context, fill: Fill): Int = ColorCompat.getThemedColor(
        context,
        when (fill) {
            Fill.DANGER -> R.b.colorTextDanger
            Fill.WARNING -> R.b.colorTextWarning
            Fill.POSITIVE -> R.b.colorTextPositive
            Fill.MUTED -> R.b.colorTextMuted
        },
    )

    private val decorator = object : ChatDecorator(name, priority = 80) {
        override fun timestampSuffix(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, view: TextView): CharSequence? {
            val data = latency(entry.message) ?: return null
            val context = view.context
            val size = (view.textSize * 1.1f).toInt()
            val bars = BarsDrawable(IntArray(3) { color(context, data.fill[it]) }).apply { setBounds(0, 0, size, size) }

            val out = SpannableStringBuilder("  ")
            out.setSpan(CenteredDrawableSpan(bars, size / 6), 1, 2, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            val delta = data.delta
            if (delta != null) out.append(if (data.ahead) "−" else "").append(shortDelta(delta, bool("showMillis")))
            return out
        }
    }

    /** The three bars of Endcord PC's latency icon, drawn in [colors] from left to right. */
    private class BarsDrawable(private val colors: IntArray) : Drawable() {
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val rect = RectF()

        override fun draw(canvas: Canvas) {
            val b = bounds
            val unit = b.width() / 16f
            // Same geometry as the 16x16 SVG: bars 3.2 wide, starting at x 1.6, 6.4 and 11.2
            val tops = floatArrayOf(11.2f, 6.4f, 1.6f)
            for (i in 0 until 3) {
                val left = b.left + (1.6f + i * 4.8f) * unit
                rect.set(left, b.top + tops[i] * unit, left + 3.2f * unit, b.top + 14.4f * unit)
                paint.color = colors[i]
                canvas.drawRoundRect(rect, 0.64f * unit, 0.64f * unit, paint)
            }
        }

        override fun setAlpha(alpha: Int) {
            paint.alpha = alpha
        }

        override fun setColorFilter(colorFilter: ColorFilter?) {
            paint.colorFilter = colorFilter
        }

        @Deprecated("Deprecated in Java")
        override fun getOpacity() = PixelFormat.TRANSLUCENT
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        super.stop(context)
    }

    private companion object {
        const val DISCORD_EPOCH = 1_420_070_400_000L
        const val DISCORD_KT_DELAY = 1_471_228_928L
        const val TROLL_LIMIT = 2 * 60 * 1000L
    }
}
