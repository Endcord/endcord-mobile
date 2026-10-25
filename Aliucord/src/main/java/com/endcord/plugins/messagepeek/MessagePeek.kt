/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagepeek

import android.content.Context
import android.view.View
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.aliucord.wrappers.ChannelWrapper.Companion.lastMessageId
import com.aliucord.wrappers.stickers.StickerPartialWrapper.Companion.name
import com.discord.databinding.WidgetChannelsListItemChannelPrivateBinding
import com.discord.models.message.Message
import com.discord.models.user.CoreUser
import com.discord.stores.StoreStream
import com.discord.widgets.channels.list.items.ChannelListItemPrivate
import com.endcord.plugins.guildscommon.ChannelListHooks
import com.endcord.plugins.guildscommon.Formats
import com.endcord.plugins.guildscommon.GuildsPlugin
import java.util.regex.Pattern

internal class MessagePeek : GuildsPlugin(
    name = "MessagePeek",
    description = "Shows the last message preview and timestamp in the Direct Messages list.",
) {
    override val tags = listOf("chat", "appearance")

    override val settingsSchema = listOf(
        PluginSetting.Switch("hideMuted", "Hide message previews and timestamps for muted DMs and group chats."),
    )

    override fun onSettingChanged(key: String) = ChannelListHooks.rebind()

    override fun start(context: Context) {
        ChannelListHooks.registerDecorator(name, object : ChannelListHooks.RowDecorator {
            override fun private(item: ChannelListItemPrivate, binding: WidgetChannelsListItemChannelPrivateBinding) {
                if (bool("hideMuted") && item.muted) return
                val channel = item.channel
                val lastId = StoreStream.getMessagesMostRecent().mostRecentIds[channel.id]?.takeIf { it != 0L }
                    ?: channel.lastMessageId.takeIf { it != 0L } ?: return
                val time = Formats.relative(Formats.snowflakeTime(lastId))
                val subtitle = binding.d
                val preview = StoreStream.getMessages().getMessage(channel.id, lastId)?.let { preview(it) }
                subtitle.text = when {
                    preview != null -> "$preview · $time"
                    subtitle.visibility == View.VISIBLE && !subtitle.text.isNullOrEmpty() -> "${subtitle.text} · $time"
                    else -> time
                }
                subtitle.visibility = View.VISIBLE
            }
        })
        ChannelListHooks.rebind()
    }

    override fun stop(context: Context) {
        super.stop(context)
        ChannelListHooks.rebind()
    }

    /** A one line summary of [message], prefixed with "You:" for your own messages. */
    private fun preview(message: Message): String? {
        val content = message.content.orEmpty().trim()
        val body = when {
            content.isNotEmpty() && GIF.matcher(content).find() -> I18n.t("sent a GIF")
            content.isNotEmpty() -> clean(content)
            ((message.flags ?: 0L) and VOICE_MESSAGE) != 0L -> I18n.t("voice message")
            !message.attachments.isNullOrEmpty() -> {
                val count = message.attachments.size
                if (count == 1) I18n.t("Sent an attachment") else I18n.t("Sent {count} attachments", "count" to count)
            }
            !message.stickerItems.isNullOrEmpty() -> message.stickerItems[0].name
            !message.embeds.isNullOrEmpty() -> I18n.t("Sent an embed")
            else -> return null
        }
        val mine = try {
            CoreUser(message.author).id == StoreStream.getUsers().me.id
        } catch (_: Throwable) {
            false
        }
        return if (mine) I18n.t("You: {message}", "message" to body) else body
    }

    /** First line of [content], with mentions and custom emoji shown by name. */
    private fun clean(content: String): String {
        var text = content.split('\n').first { it.isNotBlank() }.trim()
        text = replace(USER_MENTION, text) { id ->
            StoreStream.getUsers().users[id]?.username?.let { "@$it" }
        }
        text = replace(CHANNEL_MENTION, text) { id ->
            StoreStream.getChannels().getChannel(id)?.let { "#" + com.discord.api.channel.ChannelUtils.c(it) }
        }
        text = EMOJI.matcher(text).replaceAll(":$1:")
        return if (text.length > MAX_LENGTH) text.substring(0, MAX_LENGTH).trimEnd() + "…" else text
    }

    private inline fun replace(pattern: Pattern, text: String, name: (Long) -> String?): String {
        val matcher = pattern.matcher(text)
        val out = StringBuffer()
        while (matcher.find()) {
            val replacement = matcher.group(1)?.toLongOrNull()?.let(name) ?: matcher.group()
            matcher.appendReplacement(out, java.util.regex.Matcher.quoteReplacement(replacement))
        }
        matcher.appendTail(out)
        return out.toString()
    }

    private companion object {
        const val VOICE_MESSAGE = 1L shl 13
        const val MAX_LENGTH = 80
        val GIF: Pattern = Pattern.compile("https?://(\\S+\\.gif|tenor\\.com|giphy\\.com|klipy\\.com)", Pattern.CASE_INSENSITIVE)
        val USER_MENTION: Pattern = Pattern.compile("<@!?(\\d+)>")
        val CHANNEL_MENTION: Pattern = Pattern.compile("<#(\\d+)>")
        val EMOJI: Pattern = Pattern.compile("<a?:(\\w+):\\d+>")
    }
}
