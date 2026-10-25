/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.copystickerlinks

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.discord.api.sticker.BaseSticker
import com.discord.api.sticker.StickerFormatType
import com.discord.api.sticker.StickerPartial
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.actionscommon.MessageParts
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R
import com.discord.api.sticker.Sticker as FullSticker

internal class CopyStickerLinks : EndcordPlugin(
    name = "CopyStickerLinks",
    description = "Adds the ability to copy & open Sticker links",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("emotes", "utility")

    override fun start(context: Context) {
        val hasStickers: (MessageActions.Context) -> Boolean = { MessageParts.stickers(it.message).isNotEmpty() }

        MessageActions.register(name, "Copy Sticker Link", R.e.ic_sticker_icon_24dp, hasStickers) { ctx ->
            withSticker(ctx) { Common.copy(url(it), "Link copied!") }
        }
        MessageActions.register(name, "Open Sticker Link", R.e.ic_open_in_new_white_24dp, hasStickers) { ctx ->
            withSticker(ctx) { Utils.launchUrl(url(it)) }
        }
    }

    private fun withSticker(ctx: MessageActions.Context, action: (BaseSticker) -> Unit) {
        val stickers = MessageParts.stickers(ctx.message)
        if (stickers.size == 1) {
            action(stickers[0])
        } else {
            Common.pick(ctx.sheet.parentFragmentManager, I18n.t("Stickers"), stickers.map { nameOf(it) }) {
                action(stickers[it])
            }
        }
    }

    private fun nameOf(sticker: BaseSticker): String = when (sticker) {
        is StickerPartial -> sticker.e()
        is FullSticker -> sticker.h() // name
        else -> null
    } ?: sticker.d().toString()

    /** Same links as Endcord PC: lossless 512px images, Lottie JSON, and GIFs through the media proxy. */
    private fun url(sticker: BaseSticker): String {
        val id = sticker.d()
        return when (sticker.a()) {
            StickerFormatType.PNG, StickerFormatType.APNG -> "https://cdn.discordapp.com/stickers/$id.png?size=512&lossless=true"
            StickerFormatType.LOTTIE -> "https://cdn.discordapp.com/stickers/$id.json"
            // GIF stickers are newer than this version of the app, which reads their format as unknown
            else -> "https://media.discordapp.net/stickers/$id.gif?size=512"
        }
    }
}
