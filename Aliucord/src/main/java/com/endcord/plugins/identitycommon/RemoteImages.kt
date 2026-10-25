/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.identitycommon

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.Drawable
import android.view.View
import android.widget.ImageView
import com.aliucord.Http
import com.aliucord.Logger
import com.aliucord.Utils
import java.lang.ref.WeakReference

/**
 * A few small remote images (badge icons) kept in memory for the whole session. Loading happens on the thread
 * pool; failures are logged once and never retried, so a dead host costs one request. Main thread only.
 */
internal object RemoteImages {
    private val logger = Logger("Endcord/RemoteImages")
    private val bitmaps = HashMap<String, Bitmap>()
    private val loading = HashSet<String>()
    private val failed = HashSet<String>()
    private val waiting = HashMap<String, MutableList<(Bitmap) -> Unit>>()
    private val drawables = HashMap<String, RemoteDrawable>()

    /** Calls [onLoaded] with the image, right away when it is cached, else once it has loaded. */
    fun load(url: String, onLoaded: (Bitmap) -> Unit) {
        bitmaps[url]?.let { return onLoaded(it) }
        if (url in failed) return
        waiting.getOrPut(url) { ArrayList() } += onLoaded
        if (!loading.add(url)) return
        Utils.threadPool.execute {
            val bitmap = try {
                val req = Http.Request(url).setRequestTimeout(15_000)
                try {
                    val res = req.execute()
                    if (res.ok()) BitmapFactory.decodeStream(res.stream()) else null
                } finally {
                    req.close()
                }
            } catch (e: Throwable) {
                null
            }
            Utils.mainThread.post {
                loading.remove(url)
                val callbacks = waiting.remove(url) ?: emptyList<(Bitmap) -> Unit>()
                if (bitmap == null) {
                    failed += url
                    logger.warn("Failed to load $url", null)
                    return@post
                }
                bitmaps[url] = bitmap
                for (cb in callbacks) try {
                    cb(bitmap)
                } catch (e: Throwable) {
                    logger.error("Image callback failed", e)
                }
            }
        }
    }

    // Any id declared by the app works as a view tag key
    private val tagKey: Int by lazy { Utils.getResId("chat_list_adapter_item_text_header", "id") }

    /** Shows [url] in [view] once loaded, unless the view was given another image in the meantime. */
    fun into(view: ImageView, url: String) {
        view.setTag(tagKey, url)
        val ref = WeakReference(view)
        load(url) { bitmap ->
            val v = ref.get() ?: return@load
            if (v.getTag(tagKey) == url) v.setImageBitmap(bitmap)
        }
    }

    /**
     * A drawable of [sizePx] showing [url], for inline spans. It draws nothing until the image has loaded, then
     * [view] is redrawn so the image appears without the row being bound again.
     */
    fun drawable(url: String, sizePx: Int, view: View): Drawable {
        val key = "$url@$sizePx"
        val drawable = drawables.getOrPut(key) { RemoteDrawable(sizePx) }
        if (drawable.bitmap == null && url !in failed) {
            val ref = WeakReference(view)
            load(url) { bitmap ->
                drawable.bitmap = bitmap
                ref.get()?.invalidate()
            }
        }
        return drawable
    }

    fun clear() {
        drawables.clear()
        waiting.clear()
    }

    private class RemoteDrawable(size: Int) : Drawable() {
        var bitmap: Bitmap? = null
        private val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
        private val dst = Rect()

        init {
            setBounds(0, 0, size, size)
        }

        override fun draw(canvas: Canvas) {
            val bmp = bitmap ?: return
            dst.set(bounds)
            canvas.drawBitmap(bmp, null, dst, paint)
        }

        override fun setAlpha(alpha: Int) {
            paint.alpha = alpha
        }

        override fun setColorFilter(colorFilter: ColorFilter?) {
            paint.colorFilter = colorFilter
        }

        @Deprecated("Deprecated in Java")
        override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
    }
}
