/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.splitlargemessages

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.rateLimitPerUser
import com.discord.api.channel.Channel
import com.discord.stores.StoreStream
import com.discord.widgets.chat.MessageManager
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.composercommon.ComposerUtils
import com.endcord.plugins.composercommon.OutgoingMessages

internal class SplitLargeMessages : ComposerPlugin(
    name = "SplitLargeMessages",
    description = "Splits oversized messages into Discord-sized chunks before sending.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Number("sendDelay", "Minimum delay between each chunk in seconds.", default = 1, min = 1, max = 10),
        PluginSetting.Choice(
            key = "splitMode",
            label = "Prefer this boundary when splitting a message.",
            options = listOf(
                PluginSetting.Choice.Option("newlines", "Newlines"),
                PluginSetting.Choice.Option("spaces", "Spaces"),
                PluginSetting.Choice.Option("characters", "Strict character limit"),
            ),
        ),
        PluginSetting.Switch(
            "splitInSlowmode",
            "Allow splitting in slowmode when its delay is within the configured maximum.",
            default = false,
        ),
        PluginSetting.Number("slowmodeMax", "Maximum slowmode duration allowed when splitting messages.", default = 5, min = 1, max = 30),
    )

    /** Chunks waiting for their turn, so stopping the plugin can drop them. */
    private val pending = ArrayList<Runnable>()

    override fun start(context: Context) {
        onOutgoing(OutgoingMessages.Priority.DELIVERY + 20) { message ->
            val limit = ComposerUtils.messageLimit()
            if (message.content.length <= limit) return@onOutgoing

            val channel = message.channel
            if (!canSplitIn(message.channelId, channel)) {
                Utils.showToast(I18n.t("Cannot split this message because of the channel's slowmode."))
                message.cancel(clearInput = false)
                return@onOutgoing
            }

            val chunks = split(message.content, limit, choice("splitMode"))
            // The first chunk takes the normal path, so it keeps the attachments and the reply
            message.content = chunks.first()
            val delay = sendDelayMs(message.channelId, channel)
            val manager = message.messageManager
            val channelId = message.channelId
            message.afterSend {
                chunks.drop(1).forEachIndexed { index, chunk ->
                    val task = object : Runnable {
                        override fun run() {
                            synchronized(pending) { pending.remove(this) }
                            send(manager, channelId, chunk)
                        }
                    }
                    synchronized(pending) { pending += task }
                    Utils.mainThread.postDelayed(task, delay * (index + 1))
                }
            }
        }
    }

    override fun stop(context: Context) {
        synchronized(pending) {
            for (task in pending) Utils.mainThread.removeCallbacks(task)
            pending.clear()
        }
        super.stop(context)
    }

    private fun send(manager: MessageManager, channelId: Long, chunk: String) {
        try {
            // content and channel given, every other argument left at its default
            MessageManager.`sendMessage$default`(manager, chunk, null, null, channelId, null, false, null, null, null, 502, null)
        } catch (e: Throwable) {
            logger.errorToast(I18n.t("Failed to send part of the message"), e)
        }
    }

    private fun canBypassSlowmode(channelId: Long): Boolean {
        val permissions = StoreStream.getPermissions().permissionsByChannel[channelId] ?: return false
        return permissions and (MANAGE_MESSAGES or MANAGE_CHANNELS) != 0L
    }

    private fun canSplitIn(channelId: Long, channel: Channel?): Boolean {
        if (channel == null) return false
        val slowmode = channel.rateLimitPerUser
        if (slowmode <= 0 || canBypassSlowmode(channelId)) return true
        return bool("splitInSlowmode") && slowmode <= int("slowmodeMax")
    }

    private fun sendDelayMs(channelId: Long, channel: Channel?): Long {
        val configured = int("sendDelay").coerceAtLeast(1) * 1000L
        val slowmode = (channel?.rateLimitPerUser ?: 0) * 1000L
        return if (slowmode <= 0 || canBypassSlowmode(channelId)) configured
        else maxOf(configured, slowmode + SLOWMODE_BUFFER_MS)
    }

    /** Endcord PC's splitter: every chunk is at most [limit] UTF-16 units, cut at the preferred boundary. */
    private fun split(content: String, limit: Int, mode: String): List<String> {
        val chunks = ArrayList<String>()
        var remaining = content
        while (remaining.length > limit) {
            var index = splitIndex(remaining, limit, mode)
            // Never cut a surrogate pair in half
            if (index in 1 until remaining.length && Character.isHighSurrogate(remaining[index - 1])) index--
            chunks += remaining.substring(0, index)
            remaining = remaining.substring(index)
        }
        if (remaining.isNotEmpty()) chunks += remaining
        return chunks
    }

    private fun splitIndex(content: String, limit: Int, mode: String): Int {
        if (mode == "characters") return limit
        val boundary = if (mode == "spaces") ' ' else '\n'
        val preferred = content.lastIndexOf(boundary, limit - 1)
        if (preferred > 0) return preferred + 1
        if (boundary == '\n') {
            val space = content.lastIndexOf(' ', limit - 1)
            if (space > 0) return space + 1
        }
        return limit
    }

    private companion object {
        const val SLOWMODE_BUFFER_MS = 250L
        const val MANAGE_CHANNELS = 1L shl 4
        const val MANAGE_MESSAGES = 1L shl 13
    }
}
