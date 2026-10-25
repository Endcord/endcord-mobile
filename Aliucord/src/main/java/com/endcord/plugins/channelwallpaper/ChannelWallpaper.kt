/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.channelwallpaper

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable
import android.text.InputType
import android.util.LruCache
import android.view.View
import androidx.recyclerview.widget.RecyclerView
import com.aliucord.Http
import com.aliucord.Utils
import com.aliucord.entities.PluginSetting
import com.aliucord.fragments.InputDialog
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.discord.widgets.chat.list.WidgetChatList
import com.discord.widgets.chat.list.model.WidgetChatListModel
import com.endcord.plugins.api.ChannelSheetActions
import com.endcord.plugins.guildsbcommon.GuildsBPlugin
import com.lytefast.flexinput.R
import org.json.JSONObject
import java.lang.ref.WeakReference

/**
 * A picture behind the messages of a channel. "Set Wallpaper" / "Remove Wallpaper" in the channel and DM
 * long-press sheet take an image URL; the picture is drawn centre-cropped behind the chat list at the configured
 * opacity. Images are downloaded in the background and kept in memory, scaled down to the screen size.
 */
internal class ChannelWallpaper : GuildsBPlugin(
    name = "ChannelWallpaper",
    description = "Allows for custom backgrounds for every individual channel.",
) {
    override val tags = listOf("appearance", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Number("opacity", "Wallpaper opacity", "0 is invisible, 100 is fully visible", default = 30, min = 0, max = 100),
        PluginSetting.Text(
            "defaultWallpaper", "Default wallpaper",
            "Default wallpaper URL (for channels without a custom one). Empty = none.", placeholder = "https://",
        ),
        PluginSetting.Action("clearWallpapers", "Remove all wallpapers", "Remove the wallpaper of every channel") {
            settings.setString(KEY, "{}")
            parsed = null
            Utils.showToast(I18n.t("Wallpapers removed"))
            reapply()
        },
    )

    private val cache = object : LruCache<String, Bitmap>(24 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }
    private val loading = HashSet<String>()

    private var chat: WeakReference<RecyclerView>? = null
    private var chatChannelId = 0L

    override fun start(context: Context) {
        patcher.after<WidgetChatList>("configureUI", WidgetChatListModel::class.java) { param ->
            try {
                val model = param.args[0] as? WidgetChatListModel ?: return@after
                val list = view as? RecyclerView ?: return@after
                if (chat?.get() !== list) chat = WeakReference(list)
                if (chatChannelId != model.channelId || list.background !is WallpaperDrawable) {
                    chatChannelId = model.channelId
                    apply(list, model.channelId)
                }
            } catch (e: Throwable) {
                logger.error("Failed to apply the wallpaper", e)
            }
        }

        ChannelSheetActions.register(name, "Set Wallpaper", R.e.ic_gallery_24dp) { ctx ->
            askUrl(ctx.channel.id)
        }
        ChannelSheetActions.register(name, "Remove Wallpaper", R.e.ic_close_grey_24dp, { wallpaperOf(it.channel.id) != null }) { ctx ->
            save(ctx.channel.id, null)
            Utils.showToast(I18n.t("Wallpaper deleted"))
        }

        reapply()
    }

    override fun onSettingChanged(key: String) = reapply()

    // ---- Storage ----

    // Parsed once and kept, the chat list asks on every update
    @Volatile private var parsed: JSONObject? = null

    private fun wallpapers(): JSONObject = parsed ?: try {
        JSONObject(settings.getString(KEY, "{}") ?: "{}")
    } catch (_: Throwable) {
        JSONObject()
    }.also { parsed = it }

    private fun wallpaperOf(channelId: Long): String? =
        wallpapers().optString(channelId.toString()).takeIf { it.isNotBlank() }

    private fun save(channelId: Long, url: String?) {
        val all = JSONObject(wallpapers().toString())
        if (url.isNullOrBlank()) all.remove(channelId.toString()) else all.put(channelId.toString(), url.trim())
        settings.setString(KEY, all.toString())
        parsed = all
        if (channelId == chatChannelId) reapply()
    }

    private fun askUrl(channelId: Long) {
        val dialog = InputDialog()
            .setTitle(I18n.t("Wallpaper"))
            .setDescription(I18n.t("Enter the URL of an image:"))
            .setPlaceholderText("https://")
            .setInputType(InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI)
        dialog.setOnDialogShownListener {
            wallpaperOf(channelId)?.let { dialog.inputLayout.editText?.setText(it) }
        }
        dialog.setOnOkListener {
            val url = dialog.input.trim()
            if (url.isNotEmpty() && !url.startsWith("https://") && !url.startsWith("http://")) {
                Utils.showToast(I18n.t("Enter a link starting with https://"))
                return@setOnOkListener
            }
            save(channelId, url)
            dialog.dismiss()
        }
        dialog.show(Utils.appActivity.supportFragmentManager, "ChannelWallpaper")
    }

    // ---- Display ----

    private fun reapply() {
        Utils.mainThread.post {
            val list = chat?.get() ?: return@post
            try {
                apply(list, chatChannelId)
            } catch (e: Throwable) {
                logger.error("Failed to apply the wallpaper", e)
            }
        }
    }

    private fun apply(list: RecyclerView, channelId: Long) {
        val url = wallpaperOf(channelId) ?: string("defaultWallpaper").trim().takeIf { it.isNotEmpty() }
        if (url == null) {
            clear(list)
            return
        }
        val bitmap = cache.get(url)
        if (bitmap != null) {
            val alpha = (int("opacity").coerceIn(0, 100) * 255) / 100
            val current = list.background as? WallpaperDrawable
            if (current != null && current.bitmap === bitmap) current.alpha = alpha
            else list.background = WallpaperDrawable(bitmap, current?.base ?: list.background).also { it.alpha = alpha }
            return
        }
        clear(list)
        load(url, list.resources.displayMetrics.widthPixels, list.resources.displayMetrics.heightPixels)
    }

    /** Puts back the background the chat list had before. */
    private fun clear(list: View) {
        val current = list.background as? WallpaperDrawable ?: return
        list.background = current.base
    }

    private fun load(url: String, width: Int, height: Int) {
        if (!loading.add(url)) return
        Utils.threadPool.execute {
            try {
                val bytes = Http.Request(url).setRequestTimeout(20_000).use { request ->
                    val res = request.execute()
                    if (!res.ok()) throw Http.HttpException(request, res)
                    res.getBytes()
                }
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                var sample = 1
                while (bounds.outWidth / (sample * 2) >= width && bounds.outHeight / (sample * 2) >= height) sample *= 2
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
                    ?: throw IllegalArgumentException("Not an image")
                Utils.mainThread.post {
                    loading.remove(url)
                    cache.put(url, bitmap)
                    reapply()
                }
            } catch (e: Throwable) {
                Utils.mainThread.post { loading.remove(url) }
                logger.errorToast(I18n.t("Couldn't load the wallpaper"), e)
            }
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        chat?.get()?.let { clear(it) }
        chat = null
        cache.evictAll()
    }

    /** Draws the view's own background [base], then [bitmap] centre-cropped over it, like `scaleType="centerCrop"`. */
    private class WallpaperDrawable(val bitmap: Bitmap, val base: Drawable?) : Drawable() {
        private val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
        private val matrix = Matrix()

        override fun onBoundsChange(bounds: android.graphics.Rect) {
            base?.bounds = bounds
        }

        override fun draw(canvas: Canvas) {
            val b = bounds
            if (b.isEmpty) return
            base?.draw(canvas)
            val scale = maxOf(b.width().toFloat() / bitmap.width, b.height().toFloat() / bitmap.height)
            matrix.setScale(scale, scale)
            matrix.postTranslate(b.left + (b.width() - bitmap.width * scale) / 2f, b.top + (b.height() - bitmap.height * scale) / 2f)
            canvas.drawBitmap(bitmap, matrix, paint)
        }

        override fun setAlpha(alpha: Int) {
            paint.alpha = alpha
            invalidateSelf()
        }

        override fun getAlpha(): Int = paint.alpha

        override fun setColorFilter(colorFilter: ColorFilter?) {
            paint.colorFilter = colorFilter
            invalidateSelf()
        }

        @Suppress("DEPRECATION")
        override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
    }

    private companion object {
        const val KEY = "wallpapers"
    }
}
