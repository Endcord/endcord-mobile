/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.reactiontimestamps

import android.content.Context
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.discord.api.message.reaction.MessageReactionEmoji
import com.discord.api.message.reaction.MessageReactionUpdate
import com.discord.databinding.WidgetManageReactionsResultUserBinding
import com.discord.stores.StoreMessageReactions
import com.discord.utilities.mg_recycler.MGRecyclerDataPayload
import com.discord.widgets.chat.managereactions.ManageReactionsResultsAdapter
import com.endcord.plugins.api.mutedColor
import java.lang.reflect.Field
import java.text.DateFormat
import java.util.Date

internal class ReactionTimestamps : EndcordPlugin(
    name = "ReactionTimestamps",
    description = "Shows each reaction time in the reaction popout.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("reactions", "chat")

    // Discord doesn't tell when a reaction was added, so like Endcord PC only reactions that arrive while the
    // app is open are known. Bounded, oldest dropped first.
    private val timestamps = object : LinkedHashMap<String, Long>(64, 0.75f, false) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?) = size > MAX_TIMESTAMPS
    }

    private val fBinding: Field by lazy {
        ManageReactionsResultsAdapter.ReactionUserViewHolder::class.java.getDeclaredField("binding").apply { isAccessible = true }
    }

    private fun key(channelId: Long, messageId: Long, userId: Long, emoji: MessageReactionEmoji) =
        "$channelId:$messageId:$userId:${emoji.d()}:${emoji.b() ?: ""}"

    override fun start(context: Context) {
        // Called on the store thread for gateway reaction events
        patcher.after<StoreMessageReactions>("handleReactionAdd", MessageReactionUpdate::class.java) { param ->
            val update = param.args[0] as MessageReactionUpdate
            synchronized(timestamps) {
                timestamps[key(update.a(), update.c(), update.d(), update.b())] = System.currentTimeMillis()
            }
        }
        patcher.after<StoreMessageReactions>("handleReactionRemove", MessageReactionUpdate::class.java) { param ->
            val update = param.args[0] as MessageReactionUpdate
            synchronized(timestamps) { timestamps.remove(key(update.a(), update.c(), update.d(), update.b())) }
        }

        patcher.after<ManageReactionsResultsAdapter.ReactionUserViewHolder>(
            "onConfigure",
            Int::class.javaPrimitiveType!!,
            MGRecyclerDataPayload::class.java,
        ) { param ->
            val item = param.args[1] as? ManageReactionsResultsAdapter.ReactionUserItem ?: return@after
            val time = synchronized(timestamps) {
                timestamps[key(item.channelId, item.messageId, item.user.id, item.emoji)]
            } ?: return@after

            val nameView = (fBinding[this] as WidgetManageReactionsResultUserBinding).d
            val formatted = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.MEDIUM).format(Date(time))
            val text = SpannableStringBuilder(nameView.text ?: "").append('\n')
            val start = text.length
            text.append(I18n.t("Reacted at {time}", "time" to formatted))
            text.setSpan(ForegroundColorSpan(mutedColor(nameView.context)), start, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            text.setSpan(RelativeSizeSpan(0.8f), start, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            // The name is laid out on one line, so make room for the time below it
            nameView.isSingleLine = false
            nameView.maxLines = 2
            nameView.text = text
        }
    }

    override fun stop(context: Context) {
        synchronized(timestamps) { timestamps.clear() }
        super.stop(context)
    }

    private companion object {
        const val MAX_TIMESTAMPS = 2000
    }
}
