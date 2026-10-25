/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.showtypingusers

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ReplacementSpan
import android.widget.TextView
import com.aliucord.Utils
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.utils.DimenUtils
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.discord.databinding.WidgetHomeBinding
import com.discord.utilities.color.ColorCompat
import com.discord.views.ToolbarTitleLayout
import com.discord.widgets.home.WidgetHome
import com.discord.widgets.home.WidgetHomeHeaderManager
import com.discord.widgets.home.WidgetHomeModel
import com.endcord.plugins.guildsbcommon.GuildsBPlugin
import com.endcord.plugins.guildsbcommon.TypingState
import com.lytefast.flexinput.R
import java.lang.ref.WeakReference

/**
 * A small "2 typing" badge after the channel name in the chat header while other people are typing in the open
 * channel. Long-press the header to see who. Updated in place from the shared typing state.
 */
internal class ShowTypingUsers : GuildsBPlugin(
    name = "ShowTypingUsers",
    description = "Shows a badge in the channel header listing who is currently typing.",
) {
    override val tags = listOf("chat", "utility")

    private var titleLayout: WeakReference<ToolbarTitleLayout>? = null
    @Volatile private var channelId = 0L
    private var guildId: Long? = null

    override fun start(context: Context) {
        patcher.after<WidgetHomeHeaderManager>(
            "configure", WidgetHome::class.java, WidgetHomeModel::class.java, WidgetHomeBinding::class.java,
        ) { param ->
            try {
                val home = param.args[0] as WidgetHome
                val model = param.args[1] as WidgetHomeModel
                val channel = model.channel
                channelId = channel?.id ?: 0L
                guildId = channel?.guildId?.takeIf { it != 0L }
                val layout = home.actionBarTitleLayout ?: return@after
                if (titleLayout?.get() !== layout) {
                    titleLayout = WeakReference(layout)
                    layout.setOnLongClickListener { showNames() }
                }
                update(TypingState.current)
            } catch (e: Throwable) {
                logger.error("Failed to add the typing badge", e)
            }
        }
        TypingState.register(name) { typing ->
            try {
                update(typing)
            } catch (e: Throwable) {
                logger.error("Failed to update the typing badge", e)
            }
        }
    }

    private fun typingUsers(typing: Map<Long, Set<Long>> = TypingState.current): List<Long> =
        if (channelId == 0L) emptyList() else TypingState.typingIn(channelId, false, typing)

    private fun showNames(): Boolean {
        val users = typingUsers()
        if (users.isEmpty()) return false
        val names = users.joinToString(", ") { TypingState.displayName(it, guildId) }
        Utils.showToast(
            if (users.size == 1) I18n.t("{names} is typing…", "names" to names)
            else I18n.t("{names} are typing…", "names" to names)
        )
        return true
    }

    private fun update(typing: Map<Long, Set<Long>>) {
        val layout = titleLayout?.get() ?: return
        val title = layout.title ?: return
        setBadge(title, typingUsers(typing).size)
    }

    private fun setBadge(title: TextView, count: Int) {
        val current = title.text ?: return
        val text = SpannableStringBuilder(current)
        if (current is Spanned) {
            for (span in current.getSpans(0, current.length, TypingBadgeSpan::class.java)) {
                val start = text.getSpanStart(span)
                val end = text.getSpanEnd(span)
                text.removeSpan(span)
                if (start >= 0 && end >= start) text.delete(start, end)
            }
        }
        if (count > 0) {
            val start = text.length
            val number = count.toString()
            val label = I18n.t("{count} typing", "count" to number)
            text.append(' ').append(label)
            val context = title.context
            text.setSpan(
                TypingBadgeSpan(
                    ColorCompat.getThemedColor(context, R.b.colorBackgroundTertiary),
                    ColorCompat.getThemedColor(context, R.b.colorTextMuted),
                    ColorCompat.getThemedColor(context, R.b.colorTextNormal),
                    label.indexOf(number).coerceAtLeast(0),
                    if (label.contains(number)) number.length else 0,
                ),
                start, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
            )
        }
        if (text.toString() != current.toString() || count > 0) title.text = text
    }

    override fun stop(context: Context) {
        super.stop(context)
        titleLayout?.get()?.let { layout ->
            layout.setOnLongClickListener(null)
            layout.isLongClickable = false
            layout.title?.let { setBadge(it, 0) }
        }
        titleLayout = null
        channelId = 0L
    }

    /**
     * A rounded badge drawn in place of its text, which is " 2 typing": a leading space (drawn as a gap) and the
     * label, whose count (at [countStart] in the label, [countLength] long) is drawn in bold.
     */
    private class TypingBadgeSpan(
        private val background: Int,
        private val color: Int,
        private val countColor: Int,
        private val countStart: Int,
        private val countLength: Int,
    ) : ReplacementSpan() {
        private val padding = DimenUtils.dpToPx(6).toFloat()
        private val gap = DimenUtils.dpToPx(6).toFloat()

        override fun getSize(paint: Paint, text: CharSequence, start: Int, end: Int, fm: Paint.FontMetricsInt?): Int {
            val old = paint.textSize
            paint.textSize = old * SCALE
            val width = paint.measureText(text, start + 1, end)
            paint.textSize = old
            return (gap + width + padding * 2).toInt() + 1
        }

        override fun draw(canvas: Canvas, text: CharSequence, start: Int, end: Int, x: Float, top: Int, y: Int, bottom: Int, paint: Paint) {
            val oldSize = paint.textSize
            val oldColor = paint.color
            val oldTypeface = paint.typeface
            paint.textSize = oldSize * SCALE
            val width = paint.measureText(text, start + 1, end)
            val metrics = paint.fontMetrics
            val height = metrics.descent - metrics.ascent
            val centerY = (top + bottom) / 2f
            val left = x + gap
            val rect = RectF(left, centerY - height / 2 - padding / 4, left + width + padding * 2, centerY + height / 2 + padding / 4)
            paint.color = background
            canvas.drawRoundRect(rect, rect.height() / 2, rect.height() / 2, paint)
            val baseline = centerY - (metrics.ascent + metrics.descent) / 2
            var cursor = rect.left + padding
            val countFrom = (start + 1 + countStart).coerceAtMost(end)
            val countTo = (countFrom + countLength).coerceAtMost(end)
            paint.color = color
            canvas.drawText(text, start + 1, countFrom, cursor, baseline, paint)
            cursor += paint.measureText(text, start + 1, countFrom)
            paint.color = countColor
            paint.typeface = Typeface.create(oldTypeface, Typeface.BOLD)
            canvas.drawText(text, countFrom, countTo, cursor, baseline, paint)
            cursor += paint.measureText(text, countFrom, countTo)
            paint.color = color
            paint.typeface = oldTypeface
            canvas.drawText(text, countTo, end, cursor, baseline, paint)
            paint.textSize = oldSize
            paint.color = oldColor
            paint.typeface = oldTypeface
        }
    }

    private companion object {
        const val SCALE = 0.7f
    }
}
