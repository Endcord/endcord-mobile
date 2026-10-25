/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.unlockedavatarzoom

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.before
import b.q.a.l.a as CropImageView

/**
 * The Android app crops avatars, banners and server icons with uCrop. Its crop view (`b.q.a.l.a`, uCrop's
 * CropImageView) lets the image grow to `setMaxScaleMultiplier` times its smallest size, which
 * `UCropActivity` sets to 10 because Discord passes no value. This replaces that limit with the setting.
 */
internal class UnlockedAvatarZoom : EndcordPlugin(
    name = "UnlockedAvatarZoom",
    description = "Allows you to zoom in further in the image crop tool when changing your avatar",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("media", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Number(
            key = "zoomMultiplier",
            label = "Zoom multiplier",
            description = "How far you can zoom in when cropping an image. The app's own limit is 10.",
            default = 25,
            min = 2,
            max = 100,
        ),
    )

    override fun start(context: Context) {
        patcher.before<CropImageView>("setMaxScaleMultiplier", Float::class.javaPrimitiveType!!) { param ->
            param.args[0] = int("zoomMultiplier").coerceIn(2, 100).toFloat()
        }
    }
}
