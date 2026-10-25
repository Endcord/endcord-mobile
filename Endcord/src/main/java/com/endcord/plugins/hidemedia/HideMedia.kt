/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.hidemedia

import android.content.Context
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.tr
import com.discord.models.message.Message
import com.discord.utilities.color.ColorCompat
import com.discord.widgets.chat.list.entries.AttachmentEntry
import com.discord.widgets.chat.list.entries.BotUiComponentEntry
import com.discord.widgets.chat.list.entries.EmbedEntry
import com.discord.widgets.chat.list.entries.StickerEntry
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.messagesacommon.ChatListFilter
import com.endcord.plugins.messagesacommon.MessageRenderHooks
import com.facebook.drawee.span.DraweeSpanStringBuilder
import com.lytefast.flexinput.R
import java.util.concurrent.ConcurrentHashMap

internal class HideMedia : EndcordPlugin(
    name = "HideMedia",
    description = "Hide attachments and embeds for individual messages from the message long-press menu",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "appearance")

    /** Ids of messages whose media is hidden, saved across restarts like on Endcord PC. */
    private val hidden: MutableSet<Long> = ConcurrentHashMap.newKeySet()

    override fun start(context: Context) {
        hidden.clear()
        settings.getString(KEY, "")?.split(',')?.mapNotNullTo(hidden) { it.trim().toLongOrNull() }

        ChatListFilter.addEntryFilter(name) { entry, message ->
            message.id in hidden &&
                (entry is AttachmentEntry || entry is EmbedEntry || entry is StickerEntry || entry is BotUiComponentEntry)
        }

        MessageRenderHooks.register(name, object : MessageRenderHooks.Handler {
            override fun afterParse(render: MessageRenderHooks.Render, text: DraweeSpanStringBuilder) {
                if (render.message.id !in hidden) return
                if (text.isNotEmpty()) text.append('\n')
                val start = text.length
                text.append(tr("Media Hidden"))
                val muted = ColorCompat.getThemedColor(render.textView.context, R.b.colorTextMuted)
                text.setSpan(ForegroundColorSpan(muted), start, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                text.setSpan(RelativeSizeSpan(0.85f), start, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        })

        MessageActions.register(
            name,
            "Hide Media",
            R.e.ic_visibility_off_white_a60_24dp,
            visible = { it.message.id !in hidden && hasMedia(it.message) },
        ) { toggle(it.message.id) }
        MessageActions.register(
            name,
            "Show Media",
            R.e.ic_visibility_white_24dp,
            visible = { it.message.id in hidden },
        ) { toggle(it.message.id) }
    }

    override fun stop(context: Context) {
        ChatListFilter.unregisterAll(name)
        MessageRenderHooks.unregisterAll(name)
        super.stop(context)
        hidden.clear()
        ChatListFilter.redrawVisible()
    }

    private fun toggle(id: Long) {
        if (!hidden.remove(id)) {
            hidden.add(id)
            // Keep the saved list bounded, dropping the oldest messages first (ids grow over time)
            while (hidden.size > MAX_SAVED) hidden.remove(hidden.minOrNull() ?: break)
        }
        val saved = hidden.joinToString(",")
        Utils.threadPool.execute { settings.setString(KEY, saved) }
        ChatListFilter.refresh()
        ChatListFilter.redrawVisible()
    }

    private fun hasMedia(message: Message): Boolean =
        !message.attachments.isNullOrEmpty() || !message.embeds.isNullOrEmpty() ||
            !message.stickerItems.isNullOrEmpty() || !message.stickers.isNullOrEmpty() ||
            !message.components.isNullOrEmpty()

    private companion object {
        const val KEY = "hiddenIds"
        const val MAX_SAVED = 1000
    }
}
