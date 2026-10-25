/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.findreply

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.discord.models.message.Message
import com.discord.stores.StoreMessages
import com.discord.stores.StoreMessagesHolder
import com.discord.stores.StoreStream
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R
import java.lang.reflect.Field

internal class FindReply : EndcordPlugin(
    name = "FindReply",
    description = "Jumps to the earliest reply to a message in a channel (lets you follow past conversations more easily).",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "shortcuts")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            key = "includePings",
            label = "Include pings",
            description = "Will also search for messages that @ the author directly",
        ),
        PluginSetting.Switch(
            key = "includeAuthor",
            label = "Include replies to the author",
            description = "Will also search for messages that reply to the author in general, not just that exact message",
        ),
        PluginSetting.Switch(
            key = "hideButtonIfNoReply",
            label = "Hide when there are no replies",
            description = "Hides the button if there are no replies to the message",
            default = true,
        ),
    )

    override fun start(context: Context) {
        MessageActions.register(
            name,
            "Jump to Reply",
            R.e.ic_arrow_down_24dp,
            visible = { ctx -> !bool("hideButtonIfNoReply") || findReplies(ctx.message).isNotEmpty() },
        ) { ctx ->
            val replies = findReplies(ctx.message)
            when (replies.size) {
                0 -> Utils.showToast(I18n.t("Couldn't find a reply."))
                1 -> Common.jumpInChat(replies[0].channelId, replies[0].id)
                else -> {
                    val labels = replies.map { "${Common.displayName(it.author)}: ${Common.preview(it, 80).ifEmpty { I18n.t("(no text)") }}" }
                    Common.pick(ctx.sheet.parentFragmentManager, I18n.t("Replies ({count})", "count" to replies.size), labels) {
                        Common.jumpInChat(replies[it].channelId, replies[it].id)
                    }
                }
            }
        }
    }

    /** Later messages of the loaded part of the channel that reply to [message], oldest first. */
    private fun findReplies(message: Message): List<Message> {
        val messages = loadedMessages(message.channelId)
        if (messages.isEmpty()) return emptyList()
        val authorId = message.author?.id ?: 0L
        val includePings = bool("includePings")
        val includeAuthor = bool("includeAuthor")
        val byId = if (includeAuthor) messages.associateBy { it.id } else emptyMap()

        val found = ArrayList<Message>()
        for (other in messages) {
            if (other.id <= message.id) continue
            val repliedTo = other.messageReference?.c() // message id
            val matches = repliedTo == message.id ||
                (includePings && authorId != 0L && other.content.orEmpty().let { "<@$authorId>" in it || "<@!$authorId>" in it }) ||
                (includeAuthor && repliedTo != null && authorId != 0L &&
                    (other.referencedMessage?.e()?.id ?: byId[repliedTo]?.author?.id) == authorId) // e() is the author
            if (matches) found += other
        }
        return found
    }

    private fun loadedMessages(channelId: Long): List<Message> = try {
        val holder = holderField.get(StoreStream.getMessages()) as StoreMessagesHolder
        // The holder locks itself while the store updates it, so copy under the same lock
        synchronized(holder) {
            holder.getMessagesForChannel(channelId)?.values?.let { ArrayList(it) } ?: emptyList()
        }
    } catch (e: Throwable) {
        logger.error("Failed to read loaded messages", e)
        emptyList()
    }

    private companion object {
        val holderField: Field by lazy {
            StoreMessages::class.java.getDeclaredField("holder").apply { isAccessible = true }
        }
    }
}
