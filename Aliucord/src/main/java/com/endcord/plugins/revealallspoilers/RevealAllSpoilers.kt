/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.revealallspoilers

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.discord.models.message.Message
import com.discord.stores.StoreStream
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R

internal class RevealAllSpoilers : EndcordPlugin(
    name = "RevealAllSpoilers",
    description = "Reveal all spoilers in a message at once from the message long-press menu",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("accessibility", "chat", "utility")

    override fun start(context: Context) {
        MessageActions.register(name, "Reveal All Spoilers", R.e.ic_spoiler, visible = { hasSpoilers(it.message) }) {
            reveal(it.message)
        }
    }

    private fun spoilerCount(content: String?): Int {
        if (content == null) return 0
        var count = 0
        var i = content.indexOf("||")
        while (i >= 0) {
            count++
            i = content.indexOf("||", i + 2)
        }
        return count / 2
    }

    private fun hasSpoilers(message: Message): Boolean =
        spoilerCount(message.content) > 0 || message.attachments?.any { it.h() } == true // h(): file name starts with SPOILER_

    private fun reveal(message: Message) {
        val state = StoreStream.getMessageState()
        // Spoilers in the text are numbered in order. Revealing a number with no spoiler does nothing
        for (i in 0 until spoilerCount(message.content)) state.revealSpoiler(message.id, i)
        // Attachments and embeds are numbered together
        val media = (message.attachments?.size ?: 0) + (message.embeds?.size ?: 0)
        for (i in 0 until media) state.revealSpoilerEmbed(message.id, i)
    }
}
