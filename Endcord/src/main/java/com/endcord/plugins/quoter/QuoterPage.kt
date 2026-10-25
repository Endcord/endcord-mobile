/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.quoter

import android.graphics.Bitmap
import android.net.Uri
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.aliucord.PluginManager
import com.aliucord.Utils
import com.aliucord.fragments.SettingsPage
import com.aliucord.i18n.I18n
import com.aliucord.utils.DimenUtils
import com.aliucord.utils.RxUtils
import com.aliucord.utils.RxUtils.subscribe
import com.aliucord.views.Button
import com.discord.stores.StoreStream
import com.discord.utilities.messagesend.MessageResult
import com.discord.views.CheckedSetting
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.actionscommon.Files
import com.endcord.plugins.actionscommon.Images
import com.lytefast.flexinput.R
import com.lytefast.flexinput.model.Attachment
import com.discord.api.user.User as ApiUser

/** Preview of a quote card with its options, and buttons to save or send it. */
internal class QuoterPage : SettingsPage() {
    var channelId: Long = 0
    var author: ApiUser? = null
    var quote: String = ""

    private val plugin get() = PluginManager.plugins["Quoter"] as? Quoter
    private var preview: ImageView? = null
    private var image: Bitmap? = null
    private var avatar: Bitmap? = null
    private var generation = 0

    override fun onViewBound(view: View) {
        super.onViewBound(view)
        setActionBarTitle(I18n.t("Catch Them In 4K."))
        setActionBarSubtitle("Endcord")
        val ctx = view.context
        val plugin = plugin
        val author = author
        if (plugin == null || author == null || quote.isEmpty()) {
            addView(TextView(ctx, null, 0, R.i.UiKit_Settings_Item_Addition).apply { text = I18n.t("Nothing to show") })
            return
        }

        preview = ImageView(ctx).apply {
            adjustViewBounds = true
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = DimenUtils.defaultPadding
            }
        }
        addView(preview)

        addView(Utils.createCheckedSetting(ctx, CheckedSetting.ViewType.SWITCH, I18n.t("Grayscale"), null).apply {
            isChecked = plugin.grayscale
            setOnCheckedListener {
                plugin.grayscale = it
                render()
            }
        })
        addView(Utils.createCheckedSetting(ctx, CheckedSetting.ViewType.SWITCH, I18n.t("Show Watermark"), null).apply {
            isChecked = plugin.showWatermark
            setOnCheckedListener {
                plugin.showWatermark = it
                render()
            }
        })

        addView(Button(ctx).apply {
            text = I18n.t("Save")
            setOnClickListener { save() }
        })
        addView(Button(ctx).apply {
            text = I18n.t("Send")
            setOnClickListener { send() }
        })

        render()
    }

    private fun render() {
        val plugin = plugin ?: return
        val author = author ?: return
        val ctx = context ?: return
        val token = ++generation
        val options = { avatar: android.graphics.Bitmap? ->
            QuoteRenderer.Options(
                avatar = avatar,
                quote = quote,
                displayName = Common.displayName(author),
                username = author.username,
                grayscale = plugin.grayscale,
                watermark = if (plugin.showWatermark) plugin.watermark else null,
                font = plugin.quoteFont(ctx),
                nameFont = plugin.nameFont(ctx),
            )
        }
        Utils.threadPool.execute {
            try {
                val avatar = avatar ?: try {
                    Images.avatar(com.discord.models.user.CoreUser(author), 512)
                } catch (_: Throwable) {
                    null
                }.also { this.avatar = it }
                val bitmap = QuoteRenderer.render(options(avatar))
                Common.ui {
                    if (token != generation) return@ui
                    image = bitmap
                    preview?.setImageBitmap(bitmap)
                }
            } catch (e: Throwable) {
                logger.error("Failed to render the quote", e)
            }
        }
    }

    private fun fileName(): String {
        val words = quote.split(' ')
        val start = (if (words.size > 6) words.take(6) else words).joinToString(" ").take(10)
        return "$start - ${author?.username ?: "quote"}.png"
    }

    private fun save() {
        val bitmap = image ?: return
        val ctx = context?.applicationContext ?: return
        Utils.threadPool.execute {
            try {
                Files.savePicture(ctx, fileName(), Images.png(bitmap))
                Utils.showToast(I18n.t("Saved to Pictures/Endcord"))
            } catch (e: Throwable) {
                logger.errorToast(I18n.t("Failed to save the image"), e)
            }
        }
    }

    private fun send() {
        val bitmap = image ?: return
        val ctx = context?.applicationContext ?: return
        val name = Files.sanitize(fileName())
        Utils.threadPool.execute {
            try {
                val file = Files.cacheFile(ctx, "quote-${System.currentTimeMillis()}.png")
                Images.writePng(bitmap, file)
                val attachment = Attachment<Any?>(System.currentTimeMillis(), Uri.fromFile(file), name, null, false)
                Common.ui {
                    StoreStream.getMessages().sendMessage(
                        channelId,
                        StoreStream.getUsers().me,
                        "",
                        emptyList(),
                        listOf(attachment),
                        emptyList(),
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                    ).subscribe(RxUtils.createActionSubscriber<MessageResult>({ result ->
                        if (result !is MessageResult.Success) logger.warn("Quote was not sent: $result")
                    }, { error ->
                        logger.error("Failed to send the quote", error)
                        Utils.showToast(I18n.t("Failed to send the message"))
                    }))
                    close()
                }
            } catch (e: Throwable) {
                logger.errorToast(I18n.t("Failed to send the message"), e)
            }
        }
    }

    private companion object {
        val logger = com.aliucord.Logger("Quoter")
    }
}
