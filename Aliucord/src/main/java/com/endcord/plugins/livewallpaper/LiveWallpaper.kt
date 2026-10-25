/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.livewallpaper

import android.app.Activity
import android.content.Context
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.after
import com.discord.app.AppActivity
import com.discord.utilities.images.MGImages
import com.facebook.drawee.view.SimpleDraweeView
import java.util.WeakHashMap

/**
 * Like Endcord PC, the wallpaper is a faint layer drawn over the whole app that lets every touch through. It is
 * loaded by the app's own image pipeline, so GIFs animate. Videos, PC's local file picker and blur are left out.
 */
internal class LiveWallpaper : EndcordPlugin(
    name = "LiveWallpaper",
    description = "Global wallpaper for the entire Discord interface (image or GIF).",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "customisation")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            key = "url",
            label = "Wallpaper URL",
            description = "A link to an image or GIF, or a file on your device as file:///sdcard/...",
            placeholder = "https://example.com/wallpaper.gif",
        ),
        PluginSetting.Number(
            key = "opacity",
            label = "Wallpaper opacity in percent (0 = invisible, 50 = max)",
            default = 15,
            min = 0,
            max = 50,
        ),
        PluginSetting.Number(
            key = "brightness",
            label = "Wallpaper brightness in percent (10 = very dark, 100 = normal, 200 = very bright)",
            default = 100,
            min = 10,
            max = 200,
        ),
    )

    /** The wallpaper view of every activity it was added to. */
    private val overlays = WeakHashMap<Activity, SimpleDraweeView>()

    override fun start(context: Context) {
        // Every screen of the app is an AppActivity (settings pages open new ones), so add the layer to each
        patcher.after<AppActivity>("onResume") {
            try {
                attach(this)
            } catch (e: Throwable) {
                logger.error("Failed to add the wallpaper", e)
            }
        }
        try {
            attach(Utils.appActivity)
        } catch (e: Throwable) {
            // No activity yet; onResume adds it
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        for (view in overlays.values.toList()) (view.parent as? ViewGroup)?.removeView(view)
        overlays.clear()
    }

    override fun onSettingChanged(key: String) {
        for (activity in overlays.keys.toList()) {
            try {
                attach(activity, reload = key == "url")
            } catch (e: Throwable) {
                logger.error("Failed to update the wallpaper", e)
            }
        }
    }

    private fun attach(activity: Activity, reload: Boolean = false) {
        val url = string("url").trim()
        val existing = overlays[activity]
        if (url.isEmpty()) {
            if (existing != null) {
                (existing.parent as? ViewGroup)?.removeView(existing)
                overlays.remove(activity)
            }
            return
        }

        val content = activity.findViewById<FrameLayout?>(android.R.id.content) ?: return
        var view = existing
        if (view == null || view.parent !== content) {
            (view?.parent as? ViewGroup)?.removeView(view)
            view = PassThroughDraweeView(activity).apply {
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
            }
            overlays[activity] = view
            content.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            load(view, url, activity)
        } else if (reload || view.tag != url) {
            load(view, url, activity)
        } else {
            // Keep it above views the screen added since
            view.bringToFront()
        }

        view.alpha = int("opacity").coerceIn(0, 50) / 100f
        val brightness = int("brightness").coerceIn(10, 200) / 100f
        if (brightness == 1f) {
            view.setLayerType(View.LAYER_TYPE_NONE, null)
        } else {
            val matrix = ColorMatrix().apply { setScale(brightness, brightness, brightness, 1f) }
            view.setLayerType(View.LAYER_TYPE_HARDWARE, Paint().apply { colorFilter = ColorMatrixColorFilter(matrix) })
        }
    }

    private fun load(view: SimpleDraweeView, url: String, activity: Activity) {
        view.tag = url
        val metrics = activity.resources.displayMetrics
        // Decoded at screen size so a huge image can't run the app out of memory; GIFs autoplay
        MGImages.setImage(view, url, metrics.widthPixels, metrics.heightPixels)
    }

    /** Never takes touches, so everything below it keeps working. */
    private class PassThroughDraweeView(context: Context) : SimpleDraweeView(context) {
        override fun dispatchTouchEvent(event: MotionEvent?): Boolean = false
        override fun onTouchEvent(event: MotionEvent?): Boolean = false
    }
}
