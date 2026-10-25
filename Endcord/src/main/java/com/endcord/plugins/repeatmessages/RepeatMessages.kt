/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.repeatmessages

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.utils.RxUtils
import com.aliucord.utils.RxUtils.subscribe
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.messages.AttachmentWrapper.Companion.filename
import com.aliucord.wrappers.messages.AttachmentWrapper.Companion.url
import com.discord.api.message.MessageReference
import com.discord.api.message.allowedmentions.MessageAllowedMentions
import com.discord.api.message.allowedmentions.MessageAllowedMentionsTypes
import com.discord.models.message.Message
import com.discord.stores.StoreStream
import com.discord.utilities.messagesend.MessageResult
import com.endcord.plugins.actionscommon.MessageParts
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R

internal class RepeatMessages : EndcordPlugin(
    name = "RepeatMessages",
    description = "Allows you to repeat messages quickly. Use Repeat and Reply to send it as a reply to the original message.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            key = "showReply",
            label = "Show Repeat and Reply",
            description = "Also add an entry that sends the copy as a reply to the original message",
            default = true,
        ),
    )

    override fun start(context: Context) {
        val canRepeat: (MessageActions.Context) -> Boolean = { ctx ->
            val message = ctx.message
            !message.isLocal && !message.isSystemMessage &&
                (!message.content.isNullOrBlank() || message.hasAttachments() || MessageParts.stickers(message).isNotEmpty())
        }
        MessageActions.register(name, "Repeat", R.e.ic_refresh_white_a60_24dp, canRepeat) { repeat(it, false) }
        MessageActions.register(
            name,
            "Repeat and Reply",
            R.e.ic_reply_24dp,
            visible = { bool("showReply") && canRepeat(it) },
        ) { repeat(it, true) }
    }

    private fun repeat(ctx: MessageActions.Context, reply: Boolean) {
        val message = ctx.message
        val me = StoreStream.getUsers().me
        val reference = if (reply) {
            MessageReference(ctx.model.channel?.guildId?.takeIf { it != 0L }, message.channelId, message.id)
        } else null
        // Never ping anyone with the copy, like Endcord PC
        val allowedMentions = MessageAllowedMentions(ArrayList<MessageAllowedMentionsTypes>(), null, null, false, 0)

        StoreStream.getMessages().sendMessage(
            message.channelId,
            me,
            content(message),
            emptyList(),
            null,
            MessageParts.stickers(message),
            reference,
            allowedMentions,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
        ).subscribe(RxUtils.createActionSubscriber<MessageResult>({ result ->
            if (result !is MessageResult.Success) logger.warn("Repeat was not sent: $result")
        }, { error ->
            logger.error("Failed to repeat the message", error)
            Utils.showToast(I18n.t("Failed to send the message"))
        }))
    }

    /** The text plus links to the attachments, since Discord can't re-send someone else's files. */
    private fun content(message: Message): String {
        val sb = StringBuilder(message.content.orEmpty())
        val attachments = MessageParts.attachments(message)
        if (attachments.isNotEmpty()) {
            sb.append("\nAttachments:")
            for (a in attachments) sb.append("\n - ").append(a.filename).append(" (").append(a.url).append(')')
        }
        return sb.toString().trim()
    }
}
