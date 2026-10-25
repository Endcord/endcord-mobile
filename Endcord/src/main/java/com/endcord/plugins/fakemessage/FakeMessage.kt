/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.fakemessage

import android.content.Context
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StyleSpan
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.tr
import com.discord.api.message.MessageFlags
import com.discord.models.message.Message
import com.discord.stores.StoreMessages
import com.discord.stores.StoreStream
import com.discord.utilities.color.ColorCompat
import com.discord.utilities.message.LocalMessageCreatorsKt
import com.discord.utilities.time.ClockFactory
import com.discord.utilities.user.UserUtils
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.commandscommon.Options
import com.lytefast.flexinput.R
import java.lang.reflect.Field
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Shows a local message posed as another user. It only ever exists on this device, is never sent to Discord,
 * disappears on restart, and always carries a "fake message" label inside the message itself, so a screenshot of
 * it can't pass for something the other person really wrote.
 */
internal class FakeMessage : EndcordPlugin(
    name = "FakeMessage",
    description = DESCRIPTION,
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "fun")

    private val fakes = CopyOnWriteArrayList<Message>()

    @Volatile
    private var fakeIds: Set<Long> = emptySet()

    private val flagsField: Field by lazy { Message::class.java.getDeclaredField("flags").apply { isAccessible = true } }

    override fun start(context: Context) {
        ChatHooks.register(object : ChatDecorator(name, 1000) {
            override fun decorateText(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, text: SpannableStringBuilder) {
                if (!fakeIds.contains(entry.message.id)) return
                val label = tr("Fake message, only visible to you")
                val start = text.length + 1
                text.append('\n').append(label)
                val end = start + label.length
                val color = ColorCompat.getThemedColor(holder.itemView.context, R.b.colorTextMuted)
                text.setSpan(ForegroundColorSpan(color), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                text.setSpan(StyleSpan(Typeface.ITALIC), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                text.setSpan(RelativeSizeSpan(0.8f), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        })

        commands.registerCommand(
            "fakemsg",
            "Locally display a fake message as another user. Only you can see it.",
            listOf(
                Options.user("user", "The user to pose the message as.", true),
                Options.string("message", "The message content to display.", true),
            ),
        ) { ctx ->
            val userId = ctx.getRequiredLong("user")
            val content = ctx.getRequiredString("message")
            val user = StoreStream.getUsers().users[userId]
                ?: return@registerCommand CommandResult(tr("Couldn't find that user."), null, false)

            val message = LocalMessageCreatorsKt.createLocalMessage(
                content,
                ctx.channelId,
                UserUtils.INSTANCE.synthesizeApiUser(user),
                null,
                false,
                false,
                null,
                null,
                ClockFactory.get(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
            )
            // Ephemeral, so Discord adds its own "Only you can see this" note and never tries to send it
            flagsField.set(message, MessageFlags.EPHEMERAL)
            fakes += message
            fakeIds = fakeIds + message.id
            StoreMessages.`access$handleLocalMessageCreate`(StoreStream.getMessages(), message)
            null
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        // Fake messages only make sense with their label, so they go away with the plugin
        val messages = StoreStream.getMessages()
        for (message in fakes) {
            try {
                messages.deleteMessage(message)
            } catch (e: Throwable) {
                logger.error("Failed to remove a fake message", e)
            }
        }
        fakes.clear()
        fakeIds = emptySet()
    }

    private companion object {
        const val DESCRIPTION = "Show a local fake message posed as any user via /fakemsg. Only you can see it, and it is always labelled as fake."
    }
}
