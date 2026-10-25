/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.validreply

import android.content.Context
import android.text.SpannableStringBuilder
import android.view.View
import android.widget.TextView
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.aliucord.utils.RxUtils.await
import com.discord.models.domain.ModelMessageDelete
import com.discord.stores.StoreMessageReplies
import com.discord.stores.StoreStream
import com.discord.utilities.rest.RestAPI
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import java.lang.reflect.Field
import java.util.Collections
import java.util.WeakHashMap
import com.discord.models.message.Message as ModelMessage

internal class ValidReply : EndcordPlugin(
    name = "ValidReply",
    description = "Fixes \"Message could not be loaded\" upon hovering over the reply",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    private val fReplyHolder: Field by lazy { field("replyHolder") }
    private val fReplyText: Field by lazy { field("replyText") }

    private fun field(name: String): Field =
        WidgetChatListAdapterItemMessage::class.java.getDeclaredField(name).apply { isAccessible = true }

    /** Reply previews that currently have our tap listener, so a recycled row doesn't keep it. */
    private val tappable = WeakHashMap<View, Boolean>()
    private val fetching: MutableSet<Long> = Collections.synchronizedSet(HashSet())

    private val decorator = object : ChatDecorator(name) {
        override fun afterConfigure(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry) {
            val replyHolder = fReplyHolder[holder] as View? ?: return
            val state = entry.replyData?.messageState
            if (state !is StoreMessageReplies.MessageState.Unloaded) {
                // Loaded previews get Discord's own listener; the others must not keep ours
                if (tappable.remove(replyHolder) != null && state !is StoreMessageReplies.MessageState.Loaded) {
                    replyHolder.setOnClickListener(null)
                    replyHolder.isClickable = false
                }
                return
            }

            val reference = entry.message.messageReference ?: return
            val messageId = reference.c() ?: return
            val channelId = reference.a() ?: entry.message.channelId

            // There is no hover on a phone, so the reply loads when tapped
            tappable[replyHolder] = true
            replyHolder.setOnClickListener { fetchReply(channelId, messageId) }

            val replyText = fReplyText[holder] as TextView?
            if (replyText != null) {
                val text = SpannableStringBuilder(replyText.text ?: "")
                text.append(" · ").append(I18n.t("Tap to load"))
                replyText.text = text
            }
        }
    }

    private fun fetchReply(channelId: Long, messageId: Long) {
        if (!fetching.add(messageId)) return
        Utils.threadPool.execute {
            try {
                val (messages, error) = RestAPI.getApi().getChannelMessagesAround(channelId, 1, messageId).await()
                if (error != null || messages == null) {
                    Utils.showToast(I18n.t("Couldn't load the replied message"))
                    return@execute
                }
                val message = messages.firstOrNull { it.o() == messageId }
                StoreStream.getDispatcherYesThisIsIntentional().schedule {
                    val replies = StoreStream.getRepliedMessages()
                    // Like Endcord PC: a different message around that ID means it was deleted
                    if (message == null) replies.handleMessageDelete(ModelMessageDelete(channelId, messageId))
                    else replies.handleLoadMessages(listOf(ModelMessage(message)))
                }
            } catch (e: Throwable) {
                logger.error("Failed to load replied message", e)
            } finally {
                fetching.remove(messageId)
            }
        }
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        for (view in tappable.keys.toList()) {
            view.setOnClickListener(null)
            view.isClickable = false
        }
        tappable.clear()
        super.stop(context)
    }
}
