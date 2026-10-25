/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.textscreenshot

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.core.content.res.ResourcesCompat
import com.aliucord.Constants
import com.aliucord.Utils
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.discord.api.commands.ApplicationCommandType
import com.discord.stores.StoreStream
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.actionscommon.Files
import com.endcord.plugins.actionscommon.Images
import java.text.DateFormat
import java.util.Calendar
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import com.discord.models.user.User as ModelUser

internal class TextScreenshot : EndcordPlugin(
    name = "TextScreenshot",
    description = "Send text as a screenshot of a Discord message with your profile",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("commands", "fun")

    override fun start(context: Context) {
        val option = Utils.createCommandOption(
            type = ApplicationCommandType.STRING,
            name = "text",
            description = "The text to screenshot",
            required = true,
        )
        for (command in listOf("txtss", "texttoscreen")) {
            commands.registerCommand(command, "Send text as a fake Discord message screenshot", listOf(option)) { ctx ->
                val text = ctx.getRequiredString("text").trim()
                if (text.isEmpty()) return@registerCommand CommandResult(I18n.t("Please provide some text."), null, false)

                val me = StoreStream.getUsers().me
                val image = render(Utils.appContext, me, text)
                val file = Files.cacheFile(Utils.appContext, "text-screenshot-${System.currentTimeMillis()}.png")
                Images.writePng(image, file)
                image.recycle()
                ctx.addAttachment(Uri.fromFile(file).toString(), "text-screenshot.png")
                CommandResult("", null, true)
            }
        }
    }

    /** Draws a message in the style of Discord's dark theme, at twice the CSS size of Endcord PC for sharpness. */
    private fun render(context: Context, user: ModelUser, text: String): Bitmap {
        val name = Common.displayName(user)
        val body = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = TEXT
            textSize = BODY_SIZE * S
            typeface = font(context, Constants.Fonts.whitney_medium, Typeface.DEFAULT)
        }
        val namePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = USERNAME
            textSize = NAME_SIZE * S
            typeface = font(context, Constants.Fonts.whitney_semibold, Typeface.DEFAULT_BOLD)
        }
        val timePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = TIMESTAMP
            textSize = TIME_SIZE * S
            typeface = font(context, Constants.Fonts.whitney_medium, Typeface.DEFAULT)
        }

        val contentX = (PADDING + AVATAR + AVATAR_MARGIN) * S
        val longest = text.split('\n').maxOf { body.measureText(it) }
        val width = max(MIN_WIDTH * S, min(MAX_WIDTH * S, contentX + longest + (PADDING + 20) * S)).toInt()
        val textWidth = (width - contentX - PADDING * S).toInt()

        val layout = staticLayout(text, body, textWidth)
        // Endcord PC puts the first baseline one line of body text plus 6px under the name's baseline
        val firstBaseline = (PADDING + HEADER_TOP + NAME_SIZE + BODY_SIZE + 6) * S
        val textTop = firstBaseline - layout.getLineBaseline(0)
        val height = ceil(max((PADDING + AVATAR + PADDING) * S, textTop + layout.height + PADDING * S)).toInt()

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(BACKGROUND)

        Images.avatar(user, 128)?.let { avatar ->
            drawCircle(canvas, avatar, PADDING * S, PADDING * S, AVATAR * S)
            avatar.recycle()
        }

        val baseline = (PADDING + HEADER_TOP + NAME_SIZE) * S
        canvas.drawText(name, contentX, baseline, namePaint)
        canvas.drawText(timestamp(), contentX + namePaint.measureText(name) + 8 * S, baseline, timePaint)

        canvas.save()
        canvas.translate(contentX, textTop)
        layout.draw(canvas)
        canvas.restore()
        return bitmap
    }

    private fun staticLayout(text: String, paint: TextPaint, width: Int): StaticLayout =
        if (Build.VERSION.SDK_INT >= 23) {
            StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
                .setLineSpacing(LINE_HEIGHT * S - paint.fontSpacing, 1f)
                .build()
        } else {
            @Suppress("DEPRECATION")
            StaticLayout(text, paint, width, Layout.Alignment.ALIGN_NORMAL, 1f, LINE_HEIGHT * S - paint.fontSpacing, false)
        }

    private fun drawCircle(canvas: Canvas, image: Bitmap, left: Float, top: Float, size: Float) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        val shader = BitmapShader(image, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        shader.setLocalMatrix(Matrix().apply {
            setScale(size / image.width, size / image.height)
            postTranslate(left, top)
        })
        paint.shader = shader
        canvas.drawCircle(left + size / 2, top + size / 2, size / 2, paint)
    }

    /** "Today at 6:00 PM" in the user's language and clock format. */
    private fun timestamp(): String {
        val time = DateFormat.getTimeInstance(DateFormat.SHORT).format(Calendar.getInstance().time)
        return I18n.t("Today at {time}", "time" to time)
    }

    private fun font(context: Context, id: Int, fallback: Typeface): Typeface = try {
        ResourcesCompat.getFont(context, id) ?: fallback
    } catch (_: Throwable) {
        fallback
    }

    private companion object {
        const val S = 2f
        const val PADDING = 16f
        const val AVATAR = 40f
        const val AVATAR_MARGIN = 12f
        const val HEADER_TOP = 4f
        const val NAME_SIZE = 16f
        const val TIME_SIZE = 12f
        const val BODY_SIZE = 16f
        const val LINE_HEIGHT = 22f
        const val MIN_WIDTH = 400f
        const val MAX_WIDTH = 600f

        val BACKGROUND = Color.parseColor("#313338")
        val TEXT = Color.parseColor("#dbdee1")
        val USERNAME = Color.parseColor("#f2f3f5")
        val TIMESTAMP = Color.parseColor("#949ba4")
    }
}
