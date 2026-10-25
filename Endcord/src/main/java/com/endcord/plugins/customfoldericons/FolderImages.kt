/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.customfoldericons

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.drawable.Drawable
import com.aliucord.Logger
import com.aliucord.Utils
import com.endcord.plugins.commandscommon.Net

/**
 * Folder pictures downloaded from the user's links, scaled down and kept for the session. Downloads run on the
 * thread pool; a link that fails isn't retried until it is saved again. Main thread only.
 */
internal object FolderImages {
    private val logger = Logger("CustomFolderIcons")
    private val bitmaps = HashMap<String, Bitmap>()
    private val failed = HashSet<String>()
    private val waiting = HashMap<String, MutableList<() -> Unit>>()

    /** Largest side kept in memory, plenty for a 48dp folder. */
    private const val MAX_SIZE = 256
    private const val MAX_BYTES = 8 * 1024 * 1024

    fun get(url: String): Bitmap? = bitmaps[url]

    /** Downloads [url] unless it is cached or known to fail, then calls [onLoaded] on the main thread. */
    fun load(url: String, onLoaded: () -> Unit) {
        if (url in bitmaps || url in failed) return
        val callbacks = waiting[url]
        if (callbacks != null) {
            callbacks += onLoaded
            return
        }
        waiting[url] = mutableListOf(onLoaded)
        Utils.threadPool.execute {
            val bitmap = try {
                decode(Net.getBytes(url, MAX_BYTES))
            } catch (e: Throwable) {
                logger.warn("Failed to load folder icon $url", e)
                null
            }
            Utils.mainThread.post {
                val pending = waiting.remove(url) ?: return@post
                if (bitmap == null) {
                    failed += url
                    Utils.showToast(com.aliucord.i18n.I18n.t("Couldn't load the folder icon"))
                    return@post
                }
                bitmaps[url] = bitmap
                for (cb in pending) try {
                    cb()
                } catch (e: Throwable) {
                    logger.error("Folder icon callback failed", e)
                }
            }
        }
    }

    /** Drops [url] from the caches so it is downloaded again. */
    fun forget(url: String) {
        bitmaps.remove(url)
        failed.remove(url)
    }

    fun clear() {
        bitmaps.clear()
        failed.clear()
        waiting.clear()
    }

    private fun decode(bytes: ByteArray): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= MAX_SIZE && bounds.outHeight / (sample * 2) >= MAX_SIZE) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    }
}

/**
 * Draws [bitmap] centred at [sizePercent] of the bounds, clipped to the rounded square of a folder, over
 * [background] when given (the folder colour, for the solid background option).
 */
internal class FolderIconDrawable(
    private val bitmap: Bitmap,
    private val sizePercent: Int,
    private val background: Int?,
) : Drawable() {
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
    private val backgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val clip = Path()
    private val rect = RectF()
    private val dst = RectF()

    override fun draw(canvas: Canvas) {
        val b = bounds
        if (b.isEmpty) return
        rect.set(b)
        // Folders are rounded squares, a third of their side
        val radius = minOf(b.width(), b.height()) / 3f
        clip.reset()
        clip.addRoundRect(rect, radius, radius, Path.Direction.CW)

        val save = canvas.save()
        canvas.clipPath(clip)
        if (background != null) {
            backgroundPaint.color = background or 0xFF000000.toInt()
            canvas.drawRect(rect, backgroundPaint)
        }
        // Fit the image in the folder, keeping its aspect ratio, then scale by the size setting
        val scale = minOf(b.width() / bitmap.width.toFloat(), b.height() / bitmap.height.toFloat()) * sizePercent / 100f
        val w = bitmap.width * scale
        val h = bitmap.height * scale
        dst.set(rect.centerX() - w / 2, rect.centerY() - h / 2, rect.centerX() + w / 2, rect.centerY() + h / 2)
        canvas.drawBitmap(bitmap, null, dst, paint)
        canvas.restoreToCount(save)
    }

    override fun setAlpha(alpha: Int) {
        paint.alpha = alpha
        backgroundPaint.alpha = alpha
    }

    override fun setColorFilter(colorFilter: ColorFilter?) {
        paint.colorFilter = colorFilter
    }

    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}
