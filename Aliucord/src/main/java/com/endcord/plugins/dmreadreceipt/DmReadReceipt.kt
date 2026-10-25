/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.dmreadreceipt

import android.content.Context
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.widget.TextView
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.wrappers.ChannelWrapper.Companion.recipientIds
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.discord.stores.StoreMessages
import com.discord.stores.StoreMessagesHolder
import com.discord.stores.StoreStream
import com.discord.stores.StoreUserTyping
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.api.mutedColor
import com.endcord.plugins.identitycommon.ChatRefresh
import java.lang.reflect.Field

/**
 * Like Endcord PC: your messages in a DM are "seen" once the other person sent a message after them, and while
 * they type every one of your messages says so. The state is shown after the timestamp, so on Android it is on
 * the first message of each group (grouped messages have no header).
 */
internal class DmReadReceipt : EndcordPlugin(
    name = "DmReadReceipt",
    description = "Shows a Seen indicator on your messages in DMs when the other person has read them.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    // The DM whose rows were bound last, so new messages and typing there can redraw the visible rows
    @Volatile private var watchedChannel = 0L
    @Volatile private var watchedRecipient = 0L
    @Volatile private var lastMessageId = 0L
    @Volatile private var recipientTyping = false

    private val decorator = object : ChatDecorator(name, priority = 90) {
        override fun timestampSuffix(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, view: TextView): CharSequence? {
            val message = entry.message
            val me = myId()
            if (me == 0L || message.author?.id != me) return null
            val channel = StoreStream.getChannels().getChannel(message.channelId) ?: return null
            if (channel.type != DM) return null
            val recipient = channel.recipientIds.firstOrNull() ?: return null

            ChatRefresh.track(holder)
            val last = lastMessage(message.channelId)
            watch(message.channelId, recipient, last?.id ?: 0L)

            val text = when {
                isTyping(message.channelId, recipient) -> I18n.t("Seen · typing...")
                last != null && last.author?.id == recipient && last.id > message.id -> I18n.t("Seen ✓")
                else -> return null
            }
            return SpannableString("  $text").apply {
                setSpan(RelativeSizeSpan(0.85f), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                setSpan(ForegroundColorSpan(mutedColor(view.context)), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        }
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
        // Typing changes don't rebind any row, so redraw the chat when the other person starts or stops typing
        patcher.after<StoreUserTyping>("snapshotData") {
            try {
                val channel = watchedChannel
                if (channel == 0L) return@after
                val typing = isTyping(channel, watchedRecipient)
                if (typing != recipientTyping) {
                    recipientTyping = typing
                    if (StoreStream.getChannelsSelected().id == channel) ChatRefresh.refresh()
                }
            } catch (e: Throwable) {
                logger.error("Failed to check typing state", e)
            }
        }
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        super.stop(context)
        watchedChannel = 0L
        watchedRecipient = 0L
        lastMessageId = 0L
        recipientTyping = false
        ChatRefresh.refresh()
    }

    /**
     * Remembers the DM being shown. A new message there only binds its own row, so when the newest message
     * changed the other rows are redrawn once to update their state.
     */
    private fun watch(channelId: Long, recipient: Long, newest: Long) {
        if (channelId != watchedChannel) {
            watchedChannel = channelId
            watchedRecipient = recipient
            lastMessageId = newest
            recipientTyping = isTyping(channelId, recipient)
            return
        }
        if (newest != lastMessageId) {
            lastMessageId = newest
            ChatRefresh.refresh()
        }
    }

    private fun myId(): Long = try {
        StoreStream.getUsers().me.id
    } catch (e: Throwable) {
        0L
    }

    /** The newest sent message of a channel. */
    private fun lastMessage(channelId: Long): com.discord.models.message.Message? {
        val holder = holderField[StoreStream.getMessages()] as StoreMessagesHolder? ?: return null
        return synchronized(holder) {
            val messages = holder.getMessagesForChannel(channelId) ?: return null
            var found: com.discord.models.message.Message? = null
            for (message in messages.descendingMap().values) {
                if (!message.isLocal && message.id > 0) {
                    found = message
                    break
                }
            }
            found
        }
    }

    private fun isTyping(channelId: Long, userId: Long): Boolean {
        val snapshot = typingSnapshot[StoreStream.getUsersTyping()] as Map<*, *>? ?: return false
        return (snapshot[channelId] as Set<*>?)?.contains(userId) == true
    }

    private companion object {
        const val DM = 1

        val holderField: Field by lazy {
            StoreMessages::class.java.getDeclaredField("holder").apply { isAccessible = true }
        }
        val typingSnapshot: Field by lazy {
            StoreUserTyping::class.java.getDeclaredField("typingUsersSnapshot").apply { isAccessible = true }
        }
    }
}
