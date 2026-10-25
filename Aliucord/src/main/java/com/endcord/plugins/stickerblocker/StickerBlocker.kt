/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.stickerblocker

import android.content.Context
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.tr
import com.aliucord.wrappers.stickers.BaseStickerWrapper.Companion.id
import com.aliucord.wrappers.stickers.BaseStickerWrapper.Companion.stickerPartial
import com.aliucord.wrappers.stickers.StickerPartialWrapper.Companion.name
import com.discord.api.sticker.BaseSticker
import com.discord.models.message.Message
import com.discord.utilities.color.ColorCompat
import com.discord.widgets.chat.list.entries.StickerEntry
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.messagesacommon.ChatListFilter
import com.endcord.plugins.messagesacommon.MessageRenderHooks
import com.facebook.drawee.span.DraweeSpanStringBuilder
import com.lytefast.flexinput.R

internal class StickerBlocker : EndcordPlugin(
    name = "StickerBlocker",
    description = "Allows you to block stickers from being displayed.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "emotes", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            key = "showMessage",
            label = "Show Message",
            description = "Whether to show a message detailing which id was blocked",
        ),
        PluginSetting.Text(
            key = "blockedStickers",
            label = "Blocked Stickers",
            description = "The list of blocked sticker IDs (don't edit unless you know what you're doing)",
            multiline = true,
        ),
    )

    @Volatile
    private var cached: Pair<String, Set<Long>>? = null

    override fun start(context: Context) {
        ChatListFilter.addEntryFilter(name) { entry, _ -> entry is StickerEntry && entry.sticker.id in blocked() }

        MessageRenderHooks.register(name, object : MessageRenderHooks.Handler {
            override fun afterParse(render: MessageRenderHooks.Render, text: DraweeSpanStringBuilder) {
                val ids = blocked()
                if (ids.isEmpty()) return
                val stickers = stickersOf(render.message).filter { it.id in ids }
                if (stickers.isEmpty()) return

                val showDetails = bool("showMessage")
                for (sticker in stickers) {
                    if (text.isNotEmpty()) text.append('\n')
                    val start = text.length
                    text.append(
                        if (showDetails) {
                            tr("Blocked sticker. ID: {id}, name: {name}", "id" to sticker.id, "name" to stickerName(sticker))
                        } else {
                            tr("Blocked sticker")
                        }
                    )
                    val muted = ColorCompat.getThemedColor(render.textView.context, R.b.colorTextMuted)
                    text.setSpan(ForegroundColorSpan(muted), start, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    text.setSpan(RelativeSizeSpan(0.85f), start, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                }
            }
        })

        MessageActions.register(
            name,
            "Block Sticker",
            R.e.ic_sticker_icon_24dp,
            visible = { ctx -> stickersOf(ctx.message).any { it.id !in blocked() } },
        ) { ctx ->
            val ids = blocked().toMutableSet()
            stickersOf(ctx.message).mapTo(ids) { it.id }
            save(ids)
        }
        MessageActions.register(
            name,
            "Unblock Sticker",
            R.e.ic_sticker_icon_24dp,
            visible = { ctx -> stickersOf(ctx.message).any { it.id in blocked() } },
        ) { ctx ->
            val remove = stickersOf(ctx.message).map { it.id }.toSet()
            save(blocked().filterTo(HashSet()) { it !in remove })
        }
    }

    override fun stop(context: Context) {
        ChatListFilter.unregisterAll(name)
        MessageRenderHooks.unregisterAll(name)
        cached = null
        super.stop(context)
        ChatListFilter.redrawVisible()
    }

    private fun blocked(): Set<Long> {
        val raw = string("blockedStickers")
        cached?.let { if (it.first == raw) return it.second }
        val ids = list("blockedStickers").mapNotNull { it.toLongOrNull() }.toHashSet()
        cached = raw to ids
        return ids
    }

    private fun save(ids: Set<Long>) {
        // Same format as Endcord PC, so the list can be copied between them
        val raw = ids.joinToString(", ")
        Utils.threadPool.execute {
            settings.setString("blockedStickers", raw)
            ChatListFilter.refresh()
            ChatListFilter.redrawVisible()
        }
    }

    private fun stickersOf(message: Message): List<BaseSticker> {
        val out = ArrayList<BaseSticker>()
        message.stickerItems?.let { out.addAll(it) }
        message.stickers?.let { out.addAll(it) }
        return out.distinctBy { it.id }
    }

    private fun stickerName(sticker: BaseSticker): String = try {
        sticker.stickerPartial.name
    } catch (_: Throwable) {
        "?"
    }
}
