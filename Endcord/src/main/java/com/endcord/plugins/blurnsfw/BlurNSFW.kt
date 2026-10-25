/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.blurnsfw

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.wrappers.ChannelWrapper.Companion.nsfw
import com.aliucord.wrappers.ChannelWrapper.Companion.parentId
import com.discord.stores.StoreStream
import com.endcord.plugins.messagesacommon.AttachmentSpoilers
import com.endcord.plugins.messagesacommon.ChatListFilter

internal class BlurNSFW : EndcordPlugin(
    name = "BlurNSFW",
    description = "Cover attachments in NSFW channels until tapped",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("privacy", "appearance")

    override fun start(context: Context) {
        AttachmentSpoilers.register(name) { entry -> isNsfw(entry.message.channelId) }
        ChatListFilter.redrawVisible()
    }

    override fun stop(context: Context) {
        AttachmentSpoilers.unregisterAll(name)
        super.stop(context)
        ChatListFilter.redrawVisible()
    }

    private fun isNsfw(channelId: Long): Boolean {
        val channels = StoreStream.getChannels()
        val channel = channels.getChannel(channelId) ?: return false
        if (channel.nsfw) return true
        // Threads inherit the NSFW setting of their channel
        val parentId = channel.parentId
        return parentId != 0L && channels.getChannel(parentId)?.nsfw == true
    }
}
