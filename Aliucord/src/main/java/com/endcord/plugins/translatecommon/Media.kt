/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.translatecommon

import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.i18n.tr
import com.endcord.plugins.commandscommon.Avatars
import com.endcord.plugins.commandscommon.Net
import com.discord.models.user.User

/** Opening and saving CDN images (avatars, banners, icons) for ViewIcons and ProfileMedia. */
internal object Media {
    private val logger = Logger("Media")

    /** Opens [url] in Discord's own media viewer. [baseName] gets the url's extension appended. */
    @JvmStatic
    fun open(url: String, baseName: String) {
        try {
            Utils.openMediaViewer(url, baseName + "." + extension(url))
        } catch (e: Throwable) {
            logger.errorToast(tr("Couldn't open the image"), e)
        }
    }

    /** Downloads [url] in the background into Downloads/Endcord and tells the user where it went. */
    @JvmStatic
    fun save(url: String, baseName: String) {
        Utils.showToast(tr("Downloading..."))
        Utils.threadPool.execute {
            try {
                val bytes = Net.getBytes(url, 32 * 1024 * 1024)
                val fileName = Downloads.safeName(baseName) + "." + extension(url)
                val where = Downloads.save(fileName, Downloads.mimeOf(fileName), bytes)
                Utils.showToast(tr("Saved to {path}", "path" to where), true)
            } catch (e: Throwable) {
                logger.error("Failed to save $url", e)
                Utils.showToast(tr("Failed to save the image: {reason}", "reason" to Net.describe(e)), true)
            }
        }
    }

    /** The extension of a CDN url, png when it has none. */
    @JvmStatic
    fun extension(url: String) = url.substringBefore('?').substringAfterLast('/').substringAfterLast('.', "png")

    /**
     * A full-size CDN url for [path] (like `avatars/<user>/<hash>`): a gif when [hash] is animated, [format]
     * otherwise.
     */
    @JvmStatic
    fun cdn(path: String, hash: String, format: String = "png", size: String = "4096"): String {
        val ext = if (hash.startsWith("a_")) "gif" else format
        return "https://cdn.discordapp.com/$path.$ext?size=$size"
    }

    /** The full-size global avatar of [user], or their default avatar. */
    @JvmStatic
    fun avatarUrl(user: User, format: String = "png", size: String = "4096"): String {
        val hash = user.avatar
        if (hash.isNullOrEmpty()) return Avatars.url(Avatars.AvatarOwner(user.id, null, user.discriminator), 4096)
        return cdn("avatars/${user.id}/$hash", hash, format, size)
    }

    /** The full-size banner url for a banner [hash] of [userId], or null. Some hashes are already urls. */
    @JvmStatic
    fun bannerUrl(userId: Long, hash: String?, format: String = "png", size: String = "4096"): String? {
        if (hash.isNullOrEmpty() || hash.startsWith("#")) return null
        if (hash.startsWith("http")) return hash
        return cdn("banners/$userId/$hash", hash, format, size)
    }
}
