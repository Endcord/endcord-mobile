/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.imagelink

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.patcher.instead
import com.discord.utilities.textprocessing.MessagePreprocessor

internal class ImageLink : EndcordPlugin(
    name = "ImageLink",
    description = "Never hide image links in messages, even if it's the only content",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("media", "appearance")

    override fun start(context: Context) {
        // Discord drops the text of a message that is just one link with one image or video embed
        patcher.instead<MessagePreprocessor>("stripSimpleEmbedLink", Collection::class.java) { null }
    }
}
