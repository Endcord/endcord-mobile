/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messageburst

import android.content.Context
import com.aliucord.entities.PluginSetting
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.composercommon.ComposerUtils
import com.endcord.plugins.composercommon.OutgoingMessages

internal class MessageBurst : ComposerPlugin(
    name = "MessageBurst",
    description = "Merges messages sent within a time period with your previous sent message if no one else sends a message before you.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat")

    override val settingsSchema = listOf(
        PluginSetting.Number("timePeriod", "The duration of bursts (in seconds).", default = 3, min = 1, max = 3600),
        PluginSetting.Switch(
            "shouldMergeWithAttachment",
            "Should the message be merged if the last message has an attachment?",
            default = false,
        ),
        PluginSetting.Switch(
            "useSpace",
            "Whether to add a space between messages when merging instead of new lines.",
            default = false,
        ),
    )

    override fun start(context: Context) {
        onOutgoing(OutgoingMessages.Priority.DELIVERY + 10) { message ->
            // Replies, messages with files and empty messages are sent normally
            if (message.startsThread || message.reply != null || message.attachments.isNotEmpty() || message.content.isBlank()) return@onOutgoing

            val last = ComposerUtils.loadedMessages(message.channelId, includePending = true).lastOrNull() ?: return@onOutgoing
            // A previous message still on its way can't be edited yet
            if (last.isLocal || last.isFailed || last.id <= 0) return@onOutgoing
            if (ComposerUtils.authorId(last) != ComposerUtils.myId() || !ComposerUtils.isTextMessage(last)) return@onOutgoing
            if (!last.attachments.isNullOrEmpty() && !bool("shouldMergeWithAttachment")) return@onOutgoing
            val sentAt = last.timestamp?.g() ?: return@onOutgoing
            if (System.currentTimeMillis() - sentAt > int("timePeriod") * 1000L) return@onOutgoing

            val merged = (last.content ?: "") + (if (bool("useSpace")) " " else "\n") + message.content
            if (merged.length > ComposerUtils.messageLimit()) return@onOutgoing

            ComposerUtils.editMessage(last.channelId, last.id, merged)
            message.cancel(clearInput = true)
        }
    }
}
