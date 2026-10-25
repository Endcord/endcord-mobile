/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.actionscommon

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.aliucord.Http
import com.discord.utilities.icon.IconUtils
import java.io.ByteArrayOutputStream
import java.io.File
import com.discord.models.user.User as ModelUser

/** Bitmap helpers for the ports that render images. Everything here blocks: call it off the main thread. */
internal object Images {
    /** Downloads a user's avatar as a bitmap, falling back to Discord's default avatar. */
    fun avatar(user: ModelUser, size: Int): Bitmap? {
        val url = try {
            IconUtils.getForUser(user, false, size)
        } catch (_: Throwable) {
            null
        }
        val sources = ArrayList<String>(2)
        if (url != null && url.startsWith("http")) sources += url
        // Users without an avatar get one of Discord's default ones, which the app keeps as a local asset
        sources += "https://cdn.discordapp.com/embed/avatars/${(user.id ushr 22) % 6}.png"
        for (source in sources) {
            try {
                return download(source)
            } catch (_: Throwable) {
            }
        }
        return null
    }

    /** Downloads and decodes an image. */
    fun download(url: String): Bitmap {
        val bytes = Http.Request(url).use { req ->
            req.execute().use { res ->
                res.assertOk()
                res.getBytes()
            }
        }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: throw IllegalStateException("Not an image: $url")
    }

    fun png(bitmap: Bitmap): ByteArray = ByteArrayOutputStream().use { out ->
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
        out.toByteArray()
    }

    fun writePng(bitmap: Bitmap, file: File) {
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
