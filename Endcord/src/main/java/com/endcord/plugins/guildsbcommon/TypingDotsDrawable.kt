/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.guildsbcommon

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.drawable.Animatable
import android.graphics.drawable.Drawable
import android.os.SystemClock
import com.aliucord.utils.DimenUtils

/**
 * Three dots in a row that pulse one after the other like Discord's typing indicator. Small enough to sit next to
 * a channel name as a compound drawable. When [TypingAnimation.disabled] is set (NoTypingAnimation), the dots are
 * drawn still.
 */
internal class TypingDotsDrawable(color: Int) : Drawable(), Animatable, Runnable {
    private val radius = DimenUtils.dpToPx(2.5f).toFloat()
    private val gap = DimenUtils.dpToPx(3f).toFloat()
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }
    private var running = false
    private var start = 0L

    var color: Int
        get() = paint.color
        set(value) {
            if (paint.color != value) {
                paint.color = value
                invalidateSelf()
            }
        }

    override fun getIntrinsicWidth(): Int = (radius * 6 + gap * 2).toInt() + 1
    override fun getIntrinsicHeight(): Int = (radius * 2).toInt() + 1

    override fun draw(canvas: Canvas) {
        val b = bounds
        val cy = b.exactCenterY()
        var cx = b.left + radius
        val animate = running && !TypingAnimation.disabled
        val now = SystemClock.uptimeMillis()
        val baseAlpha = paint.alpha
        for (i in 0 until 3) {
            var scale = 1f
            if (animate) {
                // Each dot grows and fades in turn, a full cycle takes CYCLE ms
                val phase = (((now - start) + CYCLE - i * STEP) % CYCLE).toFloat() / CYCLE
                val wave = if (phase < 0.5f) phase * 2 else (1 - phase) * 2
                scale = 0.7f + 0.3f * wave
                paint.alpha = (baseAlpha * (0.4f + 0.6f * wave)).toInt()
            }
            canvas.drawCircle(cx, cy, radius * scale, paint)
            paint.alpha = baseAlpha
            cx += radius * 2 + gap
        }
        if (animate) scheduleSelf(this, now + FRAME)
    }

    override fun run() = invalidateSelf()

    override fun start() {
        if (running) return
        running = true
        start = SystemClock.uptimeMillis()
        invalidateSelf()
    }

    override fun stop() {
        running = false
        unscheduleSelf(this)
        invalidateSelf()
    }

    override fun isRunning(): Boolean = running

    override fun setAlpha(alpha: Int) {
        paint.alpha = alpha
        invalidateSelf()
    }

    override fun setColorFilter(colorFilter: ColorFilter?) {
        paint.colorFilter = colorFilter
        invalidateSelf()
    }

    @Suppress("DEPRECATION")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT

    private companion object {
        const val CYCLE = 1200L
        const val STEP = 200L
        const val FRAME = 50L
    }
}

/** Shared switch NoTypingAnimation uses to stop every typing dots animation of this batch. */
internal object TypingAnimation {
    @Volatile
    @JvmField
    var disabled = false
}
