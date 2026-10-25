/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.quoter

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import kotlin.math.max

/** Draws Endcord PC's quote card: the avatar on the left fading into black, the quote centered on the right. */
internal object QuoteRenderer {
    private const val WIDTH = 1200
    private const val HEIGHT = 600
    private const val QUOTE_X = 640f
    private const val QUOTE_WIDTH = 520
    private const val MAX_CONTENT_HEIGHT = 480f
    private const val AUTHOR_TOP = 60f
    private const val USERNAME_GAP = 10f
    private const val GRADIENT_WIDTH = 400f
    private const val WATERMARK_PADDING = 20f
    private val GRAY = Color.parseColor("#888888")

    class Options(
        val avatar: Bitmap?,
        val quote: String,
        val displayName: String,
        val username: String,
        val grayscale: Boolean,
        val watermark: String?,
        val font: Typeface,
        val nameFont: Typeface,
    )

    fun render(o: Options): Bitmap {
        val bitmap = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.BLACK)

        o.avatar?.let { avatar ->
            val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
            if (o.grayscale) paint.colorFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(0f) })
            canvas.drawBitmap(avatar, Rect(0, 0, avatar.width, avatar.height), RectF(0f, 0f, HEIGHT.toFloat(), HEIGHT.toFloat()), paint)
        }

        val gradientStart = HEIGHT - GRADIENT_WIDTH
        canvas.drawRect(gradientStart, 0f, HEIGHT.toFloat(), HEIGHT.toFloat(), Paint().apply {
            shader = LinearGradient(gradientStart, 0f, HEIGHT.toFloat(), 0f, Color.TRANSPARENT, Color.BLACK, Shader.TileMode.CLAMP)
        })

        // Largest font size from 42 down to 18 that fits, like Endcord PC
        val quotePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            typeface = o.font
        }
        var fontSize = 42f
        var layout: StaticLayout
        var authorSize: Float
        var usernameSize: Float
        while (true) {
            quotePaint.textSize = fontSize
            layout = layout(o.quote, quotePaint, fontSize * 1.25f)
            authorSize = max(22f, fontSize * 0.6f)
            usernameSize = max(18f, fontSize * 0.45f)
            val total = layout.height + AUTHOR_TOP + authorSize + USERNAME_GAP + usernameSize
            if (total <= MAX_CONTENT_HEIGHT || fontSize <= 18f) break
            fontSize -= 2f
        }

        val total = layout.height + AUTHOR_TOP + authorSize + USERNAME_GAP + usernameSize
        val top = max(0f, (HEIGHT - total) / 2)
        canvas.save()
        canvas.translate(QUOTE_X, top)
        layout.draw(canvas)
        canvas.restore()

        val authorPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = authorSize
            typeface = Typeface.create(o.nameFont, Typeface.ITALIC)
        }
        val authorText = "- ${o.displayName}"
        val authorY = top + layout.height + AUTHOR_TOP
        canvas.drawText(authorText, centered(authorPaint, authorText), authorY, authorPaint)

        val usernamePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = GRAY
            textSize = usernameSize
            typeface = o.nameFont
        }
        val usernameText = "@${o.username}"
        canvas.drawText(usernameText, centered(usernamePaint, usernameText), authorY + USERNAME_GAP + usernameSize, usernamePaint)

        val watermark = o.watermark?.take(32)
        if (!watermark.isNullOrBlank()) {
            val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = GRAY
                textSize = 18f
                typeface = o.nameFont
            }
            canvas.drawText(watermark, WIDTH - paint.measureText(watermark) - WATERMARK_PADDING, HEIGHT - WATERMARK_PADDING, paint)
        }
        return bitmap
    }

    private fun centered(paint: Paint, text: String) = QUOTE_X + (QUOTE_WIDTH - paint.measureText(text)) / 2

    private fun layout(text: String, paint: TextPaint, lineHeight: Float): StaticLayout =
        StaticLayout.Builder.obtain(text, 0, text.length, paint, QUOTE_WIDTH)
            .setAlignment(Layout.Alignment.ALIGN_CENTER)
            .setLineSpacing(lineHeight - paint.fontSpacing, 1f)
            .build()
}
