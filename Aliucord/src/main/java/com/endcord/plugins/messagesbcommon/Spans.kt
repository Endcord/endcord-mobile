/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagesbcommon

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.drawable.Drawable
import android.text.Spanned
import android.text.TextPaint
import android.text.style.ReplacementSpan
import android.view.View
import com.discord.utilities.color.ColorCompat
import com.discord.utilities.spans.BlockBackgroundSpan
import com.discord.utilities.spans.TypefaceSpanCompat
import com.lytefast.flexinput.R

/** The muted text color of the current theme, as used for timestamps. */
internal fun mutedColor(context: Context): Int = ColorCompat.getThemedColor(context, R.b.colorTextMuted)

/**
 * Whether [start]..[end] of rendered message text overlaps code, a link or a mention, which Endcord PC's
 * markdown rules never look into.
 */
internal fun Spanned.isCodeOrLink(start: Int, end: Int): Boolean =
    getSpans(start, end, TypefaceSpanCompat::class.java).isNotEmpty() ||
        getSpans(start, end, BlockBackgroundSpan::class.java).isNotEmpty() ||
        getSpans(start, end, android.text.style.ClickableSpan::class.java).isNotEmpty()

/** Draws a drawable centred on the line, unlike ImageSpan which can only align to the baseline before API 29. */
internal class CenteredDrawableSpan(private val drawable: Drawable, private val marginPx: Int = 0) : ReplacementSpan() {
    private val metrics = Paint.FontMetricsInt()

    override fun getSize(paint: Paint, text: CharSequence?, start: Int, end: Int, fm: Paint.FontMetricsInt?): Int {
        if (fm != null) {
            paint.getFontMetricsInt(metrics)
            fm.ascent = metrics.ascent
            fm.descent = metrics.descent
            fm.top = metrics.top
            fm.bottom = metrics.bottom
        }
        return drawable.bounds.width() + marginPx * 2
    }

    override fun draw(
        canvas: Canvas,
        text: CharSequence?,
        start: Int,
        end: Int,
        x: Float,
        top: Int,
        y: Int,
        bottom: Int,
        paint: Paint,
    ) {
        paint.getFontMetricsInt(metrics)
        val centre = y + (metrics.ascent + metrics.descent) / 2
        canvas.save()
        canvas.translate(x + marginPx, (centre - drawable.bounds.height() / 2).toFloat())
        drawable.draw(canvas)
        canvas.restore()
    }
}

/** A small rounded square in [color], drawn in place of the character it spans. */
internal class ColorBlockSpan(private val color: Int, private val marginStartPx: Int, private val marginEndPx: Int) : ReplacementSpan() {
    private val rect = RectF()
    private val metrics = Paint.FontMetricsInt()

    private fun size(paint: Paint) = (paint.textSize * 0.9f).toInt()

    override fun getSize(paint: Paint, text: CharSequence?, start: Int, end: Int, fm: Paint.FontMetricsInt?): Int {
        if (fm != null) {
            paint.getFontMetricsInt(metrics)
            fm.ascent = metrics.ascent
            fm.descent = metrics.descent
            fm.top = metrics.top
            fm.bottom = metrics.bottom
        }
        return size(paint) + marginStartPx + marginEndPx
    }

    override fun draw(
        canvas: Canvas,
        text: CharSequence?,
        start: Int,
        end: Int,
        x: Float,
        top: Int,
        y: Int,
        bottom: Int,
        paint: Paint,
    ) {
        val size = size(paint)
        paint.getFontMetricsInt(metrics)
        val centre = y + (metrics.ascent + metrics.descent) / 2f
        val left = x + marginStartPx
        rect.set(left, centre - size / 2f, left + size, centre + size / 2f)
        val oldColor = paint.color
        val oldStyle = paint.style
        paint.color = color
        paint.style = Paint.Style.FILL
        val radius = size / 4f
        canvas.drawRoundRect(rect, radius, radius, paint)
        paint.color = oldColor
        paint.style = oldStyle
    }
}

/**
 * A tappable stretch of text that keeps the text's own color. Message text views dispatch taps to any
 * [android.text.style.ClickableSpan], so this works inside chat messages.
 */
internal class TapSpan(private val underline: Boolean, private val onTap: (View) -> Unit) : android.text.style.ClickableSpan() {
    override fun onClick(widget: View) = onTap(widget)

    override fun updateDrawState(ds: TextPaint) {
        ds.isUnderlineText = underline
    }
}
