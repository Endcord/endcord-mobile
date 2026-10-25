/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.richmagnetlinks

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.graphics.Typeface
import androidx.core.content.ContextCompat
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.discord.utilities.color.ColorCompat
import com.discord.utilities.spans.ClickableSpan
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.CenteredDrawableSpan
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.api.isCodeOrLink
import com.lytefast.flexinput.R
import java.net.URLDecoder
import java.util.regex.Pattern

internal class RichMagnetLinks : EndcordPlugin(
    name = "RichMagnetLinks",
    description = "Renders magnet links like message links",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "chat")

    /** The `dn` (display name) parameter of a magnet link, like Endcord PC. */
    private fun fileName(magnet: String): String {
        try {
            val query = magnet.substringAfter('?', "")
            for (param in query.split('&')) {
                if (!param.startsWith("dn=")) continue
                val name = URLDecoder.decode(param.substring(3).replace("+", " "), "UTF-8")
                if (name.isNotBlank()) return name
            }
        } catch (e: Throwable) {
            logger.error("Failed to parse magnet link", e)
        }
        return I18n.t("unknown filename")
    }

    private fun open(context: Context, magnet: String) {
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(magnet)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            Utils.showToast(I18n.t("No installed app can open magnet links"))
        }
    }

    private val decorator = object : ChatDecorator(name, priority = -20) {
        override fun decorateText(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, text: SpannableStringBuilder) {
            val content = entry.message.content ?: return
            if (!content.contains("magnet:?", ignoreCase = true)) return

            val matcher = MAGNET.matcher(text)
            val ranges = ArrayList<IntArray>(2)
            while (matcher.find()) {
                if (!text.isCodeOrLink(matcher.start(), matcher.end())) ranges += intArrayOf(matcher.start(), matcher.end())
            }
            if (ranges.isEmpty()) return

            val context = holder.itemView.context
            val background = ColorCompat.getThemedColor(context, R.b.theme_chat_mention_background)
            val foreground = ColorCompat.getThemedColor(context, R.b.theme_chat_mention_foreground)
            val textView = WidgetChatListAdapterItemMessage.`access$getItemText$p`(holder)
            val iconSize = ((textView?.textSize ?: 40f) * 0.9f).toInt()

            // From the end so earlier offsets stay valid
            for (i in ranges.indices.reversed()) {
                val (start, end) = ranges[i].let { it[0] to it[1] }
                val magnet = text.substring(start, end)
                val label = " " + fileName(magnet)
                text.replace(start, end, label)
                val labelEnd = start + label.length

                ContextCompat.getDrawable(context, R.e.ic_link_white_24dp)?.mutate()?.let { icon ->
                    icon.setTint(foreground)
                    icon.setBounds(0, 0, iconSize, iconSize)
                    text.setSpan(CenteredDrawableSpan(icon, iconSize / 6), start, start + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                }
                text.setSpan(BackgroundColorSpan(background), start, labelEnd, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                text.setSpan(ForegroundColorSpan(foreground), start, labelEnd, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                text.setSpan(StyleSpan(Typeface.BOLD), start, labelEnd, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                text.setSpan(
                    ClickableSpan(
                        foreground,
                        false,
                        { view -> Utils.setClipboard("Magnet link", magnet); Utils.showToast(I18n.t("Copied magnet link")) },
                        { view -> open(view.context, magnet) },
                    ),
                    start,
                    labelEnd,
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
                )
            }
        }
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        super.stop(context)
    }

    private companion object {
        val MAGNET: Pattern = Pattern.compile("magnet:\\?[^\\s\\u200B]+", Pattern.CASE_INSENSITIVE)
    }
}
