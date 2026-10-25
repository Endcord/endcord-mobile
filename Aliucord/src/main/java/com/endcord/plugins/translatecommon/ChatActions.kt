/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.translatecommon

import com.aliucord.Logger
import com.aliucord.utils.ReflectUtils
import com.aliucord.wrappers.ChannelWrapper.Companion.isGuild
import com.discord.api.message.MessageFlags
import com.discord.api.message.MessageTypes
import com.discord.models.message.Message
import com.discord.stores.StoreChat
import com.discord.stores.StoreStream
import com.discord.widgets.chat.list.actions.WidgetChatListActions
import java.lang.reflect.Method

/** Starts the same edit and reply flows as the message long-press sheet. */
internal object ChatActions {
    private val logger = Logger("ChatActions")

    // WidgetChatListActions.editMessage only uses stores, never the sheet itself, so it is called on a bare
    // instance. It turns mentions and emojis back into the text you type, which a raw copy of the content wouldn't.
    private val editMethod: Method by lazy {
        WidgetChatListActions::class.java.getDeclaredMethod("editMessage", Message::class.java).apply { isAccessible = true }
    }
    private val bareSheet: WidgetChatListActions by lazy { ReflectUtils.allocateInstance(WidgetChatListActions::class.java) }

    /** Whether [message] is the user's own, sent, editable message. */
    @JvmStatic
    fun canEdit(message: Message): Boolean {
        val me = StoreStream.getUsers().me ?: return false
        if (message.author?.id != me.id) return false
        if (message.id <= 0 || message.isLocal || message.isFailed) return false
        val type = message.type ?: return false
        return type == MessageTypes.DEFAULT || type == MessageTypes.REPLY
    }

    /** Opens [message] in the chat box for editing. */
    @JvmStatic
    fun startEdit(message: Message) {
        try {
            editMethod.invoke(bareSheet, message)
        } catch (e: Throwable) {
            logger.error("Falling back to editing the raw message content", e)
            StoreStream.getChat().setEditingMessage(StoreChat.EditingMessage(message, message.content ?: ""))
        }
    }

    /** Whether the user can reply to [message] in its channel. */
    @JvmStatic
    fun canReply(message: Message): Boolean {
        if (message.id <= 0 || message.isLocal || message.isFailed) return false
        val type = message.type ?: return false
        if (type != MessageTypes.DEFAULT && type != MessageTypes.REPLY && type != MessageTypes.CHAT_INPUT_COMMAND &&
            type != MessageTypes.CONTEXT_MENU_COMMAND
        ) return false
        if (message.isEphemeralMessage()) return false
        val channel = StoreStream.getChannels().getChannel(message.channelId) ?: return false
        // DMs have no permissions to check
        if (channel.isGuild()) {
            val perms = StoreStream.getPermissions().permissionsByChannel[message.channelId] ?: return false
            if (perms and SEND_MESSAGES == 0L) return false
        }
        return true
    }

    /** Starts a reply to [message], mentioning its author like the long-press sheet does. */
    @JvmStatic
    fun startReply(message: Message) {
        val channel = StoreStream.getChannels().getChannel(message.channelId) ?: return
        val me = StoreStream.getUsers().me
        val isMine = me != null && message.author?.id == me.id
        val webhook = message.isWebhook
        val shouldMention = !webhook && !isMine
        val showToggle = channel.isGuild() && !webhook && !isMine
        StoreAccess.pendingReplies().onCreatePendingReply(channel, message, shouldMention, showToggle)
    }

    private fun Message.isEphemeralMessage(): Boolean = ((flags ?: 0L) and MessageFlags.EPHEMERAL.toLong()) != 0L

    private const val SEND_MESSAGES = 1L shl 11
}
