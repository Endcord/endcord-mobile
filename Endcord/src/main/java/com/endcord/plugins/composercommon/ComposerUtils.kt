/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.composercommon

import com.aliucord.Http
import com.aliucord.Logger
import com.aliucord.Utils
import com.discord.api.premium.PremiumTier
import com.discord.models.message.Message
import com.discord.models.user.CoreUser
import com.discord.stores.StoreMessages
import com.discord.stores.StoreMessagesHolder
import com.discord.stores.StoreStream
import com.discord.utilities.rest.SendUtils
import java.net.URLEncoder

/** Small helpers the composer plugins share. */
internal object ComposerUtils {
    private val logger = Logger("ComposerUtils")

    private val holderField by lazy {
        StoreMessages::class.java.getDeclaredField("holder").apply { isAccessible = true }
    }

    /** The id of the logged in user, or 0 before login. */
    @JvmStatic
    fun myId(): Long = try {
        StoreStream.getUsers().me.id
    } catch (e: Throwable) {
        0L
    }

    /** The longest message the user may send: 4000 characters with Nitro, 2000 otherwise. */
    @JvmStatic
    fun messageLimit(): Int = try {
        if (StoreStream.getUsers().me.premiumTier == PremiumTier.TIER_2) SendUtils.MAX_MESSAGE_CHARACTER_COUNT_PREMIUM
        else SendUtils.MAX_MESSAGE_CHARACTER_COUNT
    } catch (e: Throwable) {
        SendUtils.MAX_MESSAGE_CHARACTER_COUNT
    }

    /** The author id of [message]. */
    @JvmStatic
    fun authorId(message: Message): Long = try {
        CoreUser(message.author).id
    } catch (e: Throwable) {
        0L
    }

    /**
     * The loaded messages of a channel, oldest first. Empty when the channel was never opened.
     *
     * @param includePending Whether to keep messages that are still being sent or failed to send.
     */
    @JvmStatic
    @JvmOverloads
    fun loadedMessages(channelId: Long, includePending: Boolean = false): List<Message> = try {
        val holder = holderField[StoreStream.getMessages()] as StoreMessagesHolder
        // The holder hands out its live map; copy it under the same lock its writers use.
        val all = synchronized(holder) { holder.getMessagesForChannel(channelId)?.values?.toList() } ?: emptyList()
        if (includePending) all else all.filter { !it.isLocal && !it.isFailed && it.id > 0 }
    } catch (e: Throwable) {
        logger.error("Failed to read the messages of $channelId", e)
        emptyList()
    }

    /** Message types that hold user text: default and reply. */
    @JvmStatic
    fun isTextMessage(message: Message): Boolean {
        val type = message.type ?: return true
        return type == 0 || type == 19
    }

    /** Edits one of the user's messages through Discord's message queue. */
    @JvmStatic
    fun editMessage(channelId: Long, messageId: Long, content: String) {
        StoreStream.getMessages().editMessage(messageId, channelId, content, null)
    }

    /** Deletes a message by id on a background thread. */
    @JvmStatic
    fun deleteMessage(channelId: Long, messageId: Long, onDone: ((Boolean) -> Unit)? = null) {
        Utils.threadPool.execute {
            val ok = try {
                Http.Request.newDiscordRNRequest("/channels/$channelId/messages/$messageId", "DELETE").execute().use { it.ok() }
            } catch (e: Throwable) {
                logger.error("Failed to delete message $messageId", e)
                false
            }
            onDone?.let { Utils.mainThread.post { it(ok) } }
        }
    }

    /**
     * Adds a reaction on a background thread. [emoji] is a unicode emoji or `name:id` for custom emojis.
     */
    @JvmStatic
    fun addReaction(channelId: Long, messageId: Long, emoji: String, onDone: ((Boolean) -> Unit)? = null) {
        Utils.threadPool.execute {
            val ok = try {
                val encoded = URLEncoder.encode(emoji, "UTF-8").replace("+", "%20")
                Http.Request.newDiscordRNRequest("/channels/$channelId/messages/$messageId/reactions/$encoded/@me", "PUT")
                    .executeWithBody("")
                    .use { it.ok() }
            } catch (e: Throwable) {
                logger.error("Failed to react to $messageId", e)
                false
            }
            onDone?.let { Utils.mainThread.post { it(ok) } }
        }
    }
}
