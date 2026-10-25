/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.copymedialink

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.actionscommon.MessageParts
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R

internal class CopyMediaLink : EndcordPlugin(
    name = "CopyMediaLink",
    description = "Adds a Copy Media Link action to messages with images or videos, copying the original link of the media.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("media", "utility")

    override fun start(context: Context) {
        MessageActions.register(
            name,
            "Copy Media Link",
            R.e.ic_link_white_24dp,
            visible = { MessageParts.media(it.message).isNotEmpty() },
        ) { ctx ->
            val media = MessageParts.media(ctx.message)
            if (media.size == 1) {
                Common.copy(media[0].url, "Media link copied!")
            } else {
                Common.pick(ctx.sheet.parentFragmentManager, I18n.t("Copy Media Link"), media.map { it.label }) {
                    Common.copy(media[it].url, "Media link copied!")
                }
            }
        }
    }
}
