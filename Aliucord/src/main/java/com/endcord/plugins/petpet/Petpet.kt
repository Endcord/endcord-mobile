/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.petpet

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.CommandContext
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.tr
import com.endcord.plugins.commandscommon.Avatars
import com.endcord.plugins.commandscommon.Net
import com.endcord.plugins.commandscommon.Options
import com.lytefast.flexinput.model.Attachment
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

internal class Petpet : EndcordPlugin(
    name = "petpet",
    description = "Adds a /petpet slash command to create headpet gifs from any image",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("fun", "commands")

    /** The hand frames, decoded once per session. */
    @Volatile
    private var frames: List<Bitmap>? = null
    private val framesLock = Any()

    private class UserError(message: String) : Exception(message)

    override fun start(context: Context) {
        commands.registerCommand(
            "petpet",
            "Create a petpet gif. Attach an image, or use the url or user option",
            listOf(
                Options.integer("delay", "The delay between each frame in ms. Rounded to nearest 10ms. Defaults to the minimum value of 20."),
                Options.integer("resolution", "Resolution for the gif. Defaults to 128, at most 512."),
                Options.string("url", "URL to fetch image from"),
                Options.user("user", "User whose avatar to use as image"),
                Options.bool("no-server-pfp", "Use the normal avatar instead of the server specific one when using the 'user' option"),
            ),
        ) { ctx -> createGif(ctx) }
    }

    override fun stop(context: Context) {
        // Not recycled: a command may still be drawing with them
        frames = null
        super.stop(context)
    }

    /** Runs on the command thread, so network, decoding and disk work are fine here. */
    private fun createGif(ctx: CommandContext): CommandResult {
        val delay = ctx.getIntOrDefault("delay", DEFAULT_DELAY)
        if (delay < 20) return reply(tr("Delay must be at least 20."))
        val resolution = ctx.getIntOrDefault("resolution", DEFAULT_RESOLUTION).coerceIn(16, 512)

        val sourceAttachment = ctx.attachments.firstOrNull { isImage(ctx.context, it) }
        val avatar = try {
            loadSource(ctx, sourceAttachment) ?: return reply(tr("No Image specified! Attach an image, or use the url or user option."))
        } catch (e: UserError) {
            return reply(e.message ?: "")
        } catch (e: Throwable) {
            logger.warn("Failed to load the petpet image", e)
            return reply(tr("Couldn't load the image: {error}", "error" to Net.describe(e)))
        }

        val hands = try {
            loadFrames(ctx.context)
        } catch (e: Throwable) {
            logger.warn("Failed to load the petpet frames", e)
            return reply(tr("Couldn't download the petpet frames: {error}", "error" to Net.describe(e)))
        }

        val file = try {
            writeGif(ctx.context, render(avatar, hands, resolution, delay))
        } catch (e: Throwable) {
            logger.error("Failed to create the petpet gif", e)
            return reply(tr("Couldn't create the gif."))
        } finally {
            avatar.recycle()
        }

        ctx.addAttachment(Uri.fromFile(file).toString(), "petpet.gif")
        // Don't send the source image along with the gif
        if (sourceAttachment != null) ctx.attachments.remove(sourceAttachment)
        return CommandResult("", null, true)
    }

    private fun reply(content: String) = CommandResult(content, null, false)

    private fun isImage(context: Context, attachment: Attachment<*>): Boolean {
        val type = try {
            context.contentResolver.getType(attachment.uri)
        } catch (_: Throwable) {
            null
        }
        if (type != null) return type.startsWith("image/")
        val name = attachment.displayName?.lowercase(Locale.ROOT) ?: return false
        return IMAGE_EXTENSIONS.any { name.endsWith(it) }
    }

    /** The image to pet: an attached image, then the url option, then the user option. */
    private fun loadSource(ctx: CommandContext, attachment: Attachment<*>?): Bitmap? {
        if (attachment != null) {
            val bytes = ctx.context.contentResolver.openInputStream(attachment.uri)?.use { it.readBytes() }
                ?: throw IOException("Can't read the attachment")
            return decode(bytes)
        }

        ctx.getString("url")?.trim()?.takeIf { it.isNotEmpty() }?.let { url ->
            if (!url.startsWith("https://") && !url.startsWith("http://")) throw UserError(tr("That isn't a valid image URL."))
            return decode(Net.getBytes(url))
        }

        val userId = ctx.getLong("user") ?: return null
        val guildId = ctx.currentChannel.guildId
        val serverAvatar = if (guildId != 0L && !ctx.getBoolOrDefault("no-server-pfp", false)) {
            Avatars.serverAvatarUrl(guildId, userId, 512, static = true)
        } else null
        val url = serverAvatar
            ?: Avatars.findUser(userId)?.let { Avatars.url(it, 512, static = true) }
            ?: throw UserError(tr("Couldn't find that user."))
        return decode(Net.getBytes(url))
    }

    /** Decodes an image, scaled down to at most about 1024 pixels on its long side. */
    private fun decode(bytes: ByteArray): Bitmap {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw UserError(tr("Upload is not an image"))
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 1024) sample *= 2
        val options = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: throw UserError(tr("Upload is not an image"))
    }

    /** The ten hand frames from Endcord PC's source, kept on disk after the first download. */
    private fun loadFrames(context: Context): List<Bitmap> {
        frames?.let { return it }
        synchronized(framesLock) {
            frames?.let { return it }
            val dir = File(context.cacheDir, "petpet/frames").apply { mkdirs() }
            val loaded = (0 until FRAMES).map { i ->
                val file = File(dir, "pet$i.gif")
                val bytes = if (file.length() > 0) file.readBytes() else Net.getBytes("$FRAMES_URL/pet$i.gif").also {
                    try {
                        file.writeBytes(it)
                    } catch (e: IOException) {
                        logger.warn("Failed to cache a petpet frame", e)
                    }
                }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: run {
                    file.delete()
                    throw IOException("Frame $i is not an image")
                }
            }
            frames = loaded
            return loaded
        }
    }

    /** Draws the frames the same way as Endcord PC and encodes them as a looping, transparent GIF. */
    private fun render(avatar: Bitmap, hands: List<Bitmap>, resolution: Int, delayMs: Int): ByteArray {
        val bitmap = Bitmap.createBitmap(resolution, resolution, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
        val size = resolution.toFloat()
        val handRect = RectF(0f, 0f, size, size)
        val pixels = ArrayList<IntArray>(FRAMES)
        try {
            for (i in 0 until FRAMES) {
                bitmap.eraseColor(Color.TRANSPARENT)
                val j = if (i < FRAMES / 2) i else FRAMES - i
                val width = 0.8f + j * 0.02f
                val height = 0.8f - j * 0.05f
                val offsetX = (1 - width) * 0.5f + 0.1f
                val offsetY = 1 - height - 0.08f
                canvas.drawBitmap(avatar, null, RectF(offsetX * size, offsetY * size, (offsetX + width) * size, (offsetY + height) * size), paint)
                canvas.drawBitmap(hands[i], null, handRect, paint)
                val frame = IntArray(resolution * resolution)
                bitmap.getPixels(frame, 0, resolution, 0, 0, resolution, resolution)
                pixels += frame
            }
        } finally {
            bitmap.recycle()
        }

        val palette = Palette.build(pixels, 255, ALPHA_THRESHOLD)
        val out = ByteArrayOutputStream(resolution * resolution * FRAMES / 2)
        val encoder = GifEncoder(out, resolution, resolution)
        encoder.start(palette.colors)
        val delayCs = max(2, (delayMs / 10.0).roundToInt())
        for (frame in pixels) {
            val indices = ByteArray(frame.size)
            for (k in frame.indices) {
                val p = frame[k]
                indices[k] = (if (p ushr 24 < ALPHA_THRESHOLD) GifEncoder.TRANSPARENT else palette.indexOf(p)).toByte()
            }
            encoder.addFrame(indices, delayCs)
        }
        encoder.finish()
        return out.toByteArray()
    }

    /** Saves the gif in the cache, clearing out gifs from earlier runs that have long been uploaded. */
    private fun writeGif(context: Context, gif: ByteArray): File {
        val dir = File(context.cacheDir, "petpet").apply { mkdirs() }
        val now = System.currentTimeMillis()
        dir.listFiles()?.forEach { if (it.isFile && it.name.endsWith(".gif") && now - it.lastModified() > 3_600_000L) it.delete() }
        return File(dir, "petpet-$now.gif").apply { writeBytes(gif) }
    }

    private companion object {
        const val DEFAULT_DELAY = 20
        const val DEFAULT_RESOLUTION = 128
        const val FRAMES = 10
        const val ALPHA_THRESHOLD = 128
        const val FRAMES_URL = "https://raw.githubusercontent.com/VenPlugs/petpet/main/frames"
        val IMAGE_EXTENSIONS = arrayOf(".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".heic")
    }
}
