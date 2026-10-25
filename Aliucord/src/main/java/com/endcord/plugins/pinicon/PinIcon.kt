/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.pinicon

import android.content.Context
import android.graphics.drawable.Drawable
import android.text.SpannableString
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.aliucord.entities.EndcordPlugin
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.CenteredDrawableSpan
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.api.mutedColor
import com.lytefast.flexinput.R
import java.lang.reflect.Field

internal class PinIcon : EndcordPlugin(
    name = "PinIcon",
    description = "Adds a pin icon to pinned messages",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "chat")

    private val fItemTimestamp: Field by lazy {
        WidgetChatListAdapterItemMessage::class.java.getDeclaredField("itemTimestamp").apply { isAccessible = true }
    }

    // One tinted drawable per text size and theme, shared by every pinned message
    private var cachedIcon: Drawable? = null
    private var cachedSize = 0
    private var cachedColor = 0

    private fun icon(view: TextView): Drawable? {
        val size = (view.textSize * 1.1f).toInt()
        val color = mutedColor(view.context)
        cachedIcon?.let { if (cachedSize == size && cachedColor == color) return it }
        val drawable = ContextCompat.getDrawable(view.context, R.e.ic_pin_24dp)?.mutate() ?: return null
        drawable.setTint(color)
        drawable.setBounds(0, 0, size, size)
        cachedIcon = drawable
        cachedSize = size
        cachedColor = color
        return drawable
    }

    private fun iconText(view: TextView): CharSequence? {
        val drawable = icon(view) ?: return null
        val margin = (view.textSize * 0.25f).toInt()
        return SpannableString(" ").apply {
            setSpan(CenteredDrawableSpan(drawable, margin), 0, 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
    }

    private val decorator = object : ChatDecorator(name, priority = 90) {
        // Rows that start a group show the pin after the timestamp
        override fun timestampSuffix(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, view: TextView): CharSequence? =
            if (entry.message.pinned == true) iconText(view) else null

        // Grouped rows have no header, so the pin goes after the text instead
        override fun decorateText(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, text: SpannableStringBuilder) {
            if (entry.message.pinned != true || entry.message.content.isNullOrEmpty()) return
            if (fItemTimestamp[holder] != null) return
            val textView = WidgetChatListAdapterItemMessage.`access$getItemText$p`(holder) ?: return
            text.append(iconText(textView) ?: return)
        }
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        cachedIcon = null
        super.stop(context)
    }
}
