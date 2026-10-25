/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagesacommon

import com.aliucord.Logger
import com.aliucord.Utils
import com.discord.models.message.Message
import com.discord.stores.StoreMessages
import com.discord.stores.StoreMessagesHolder
import com.discord.stores.StoreStream
import java.lang.reflect.Field
import java.lang.reflect.Method
import java.util.TreeMap

/**
 * Access to the message cache behind the chat list ([StoreMessagesHolder]), shared by the message plugins.
 *
 * The holder synchronizes every method on itself, so everything here that touches its maps must run inside
 * `synchronized(holder)`.
 */
internal object MessageStoreAccess {
    private val logger = Logger("MessagesCommon")

    private val holderField: Field by lazy {
        StoreMessages::class.java.getDeclaredField("holder").apply { isAccessible = true }
    }
    private val messagesField: Field by lazy {
        StoreMessagesHolder::class.java.getDeclaredField("messages").apply { isAccessible = true }
    }
    private val updatedChannelsField: Field by lazy {
        StoreMessagesHolder::class.java.getDeclaredField("updatedChannels").apply { isAccessible = true }
    }
    private val publishMethod: Method by lazy {
        StoreMessagesHolder::class.java.getDeclaredMethod("publishIfUpdated").apply { isAccessible = true }
    }

    /** The holder of the message store. */
    val holder: StoreMessagesHolder
        get() = holderField.get(StoreStream.getMessages()) as StoreMessagesHolder

    /** The cached messages of [channelId], keyed by message id. Call with the holder's monitor held. */
    @Suppress("UNCHECKED_CAST")
    fun channelMessages(holder: StoreMessagesHolder, channelId: Long): TreeMap<Long, Message>? =
        (messagesField.get(holder) as Map<Long, TreeMap<Long, Message>>)[channelId]

    /** Every channel with cached messages. Call with the holder's monitor held. */
    @Suppress("UNCHECKED_CAST")
    fun cachedChannels(holder: StoreMessagesHolder): Map<Long, TreeMap<Long, Message>> =
        messagesField.get(holder) as Map<Long, TreeMap<Long, Message>>

    /** Marks [channelId] as changed so the next [publish] sends its messages again. Call with the monitor held. */
    @Suppress("UNCHECKED_CAST")
    fun markUpdated(holder: StoreMessagesHolder, channelId: Long) {
        (updatedChannelsField.get(holder) as MutableSet<Long>).add(channelId)
    }

    /** Sends the messages of every channel marked with [markUpdated] to the chat. Call with the monitor held. */
    fun publish(holder: StoreMessagesHolder) {
        publishMethod.invoke(holder)
    }

    /**
     * Makes every open chat rebuild its message list, so changed filters or markers show up right away.
     * Runs in the background because publishing may persist the message cache.
     */
    fun republishAll() {
        Utils.threadPool.execute {
            try {
                val holder = holder
                synchronized(holder) {
                    for (channelId in cachedChannels(holder).keys) markUpdated(holder, channelId)
                    publish(holder)
                }
            } catch (e: Throwable) {
                logger.error("Failed to refresh the chat", e)
            }
        }
    }

    /** A copy of [message] with different [flags]; everything else stays the same. */
    fun copyWithFlags(message: Message, flags: Long?): Message = message.copy(
        message.id,
        message.channelId,
        message.guildId,
        message.author,
        message.content,
        message.timestamp,
        message.editedTimestamp,
        message.tts,
        message.mentionEveryone,
        message.mentions,
        message.mentionRoles,
        message.attachments,
        message.embeds,
        message.reactions,
        message.nonce,
        message.pinned,
        message.webhookId,
        message.type,
        message.activity,
        message.application,
        message.applicationId,
        message.messageReference,
        flags,
        message.stickers,
        message.stickerItems,
        message.referencedMessage,
        message.interaction,
        message.thread,
        message.components,
        message.call,
        message.hit,
        message.roleSubscriptionData,
        message.hasLocalUploads,
        message.allowedMentions,
        message.numRetries,
        message.initialAttemptTimestamp,
        message.lastManualAttemptTimestamp,
        message.localAttachments,
        message.captchaPayload,
    )
}
