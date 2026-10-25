/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.silentmessagetoggle

import android.content.Context
import com.aliucord.Http
import com.aliucord.Utils
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.discord.stores.StoreStream
import com.discord.widgets.chat.MessageManager
import com.endcord.plugins.composercommon.ChatInputs
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.composercommon.ComposerUtils
import com.endcord.plugins.composercommon.OutgoingMessage
import com.endcord.plugins.composercommon.OutgoingMessages

/**
 * The legacy app predates `@silent` and can't add message flags to what it sends, so silent messages are sent
 * through the API directly with the "suppress notifications" flag. They show up once Discord confirms them.
 */
internal class SilentMessageToggle : ComposerPlugin(
    name = "SilentMessageToggle",
    description = "Adds a toggle to the send button's long-press menu to send a silent message.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            "persistState",
            "Whether to persist the state of the silent message toggle when changing channels",
            default = false,
        ),
        PluginSetting.Switch(
            "autoDisable",
            "Automatically disable the silent message toggle again after sending one",
            default = true,
        ),
    )

    private var enabled = false

    /** The channel the toggle was turned on in, for [persistState] off. */
    private var enabledIn = 0L

    private fun isOn(channelId: Long): Boolean {
        if (enabled && !bool("persistState") && channelId != enabledIn) enabled = false
        return enabled
    }

    override fun start(context: Context) {
        composerAction("Send silently", checked = { isOn(StoreStream.getChannelsSelected().id) }) {
            enabled = !isOn(it.channelId)
            enabledIn = it.channelId
            Utils.showToast(I18n.t(if (enabled) "Silent messages on" else "Silent messages off"))
        }

        // Before SplitLargeMessages, which handles the messages that are too long to go out silently
        onOutgoing(OutgoingMessages.Priority.DELIVERY + 15) { message ->
            if (message.startsThread || !isOn(message.channelId)) return@onOutgoing
            if (message.attachments.isNotEmpty() || message.content.isBlank() || message.content.length > ComposerUtils.messageLimit()) {
                Utils.showToast(I18n.t("Silent messages can't include files or go over the length limit, so this one was sent normally"))
                return@onOutgoing
            }
            if (bool("autoDisable")) enabled = false
            // What the user typed, to put it back if sending fails
            val typed = ChatInputs.current().firstOrNull()?.l()?.text?.toString() ?: ""
            sendSilently(message, typed)
            message.cancel(clearInput = true)
        }
    }

    override fun stop(context: Context) {
        enabled = false
        super.stop(context)
    }

    private fun sendSilently(message: OutgoingMessage, typed: String) {
        val body = HashMap<String, Any>()
        body["content"] = message.content
        body["nonce"] = Utils.generateRNNonce().toString()
        body["flags"] = SUPPRESS_NOTIFICATIONS
        message.reply?.let { reply ->
            val reference = reply.messageReference
            body["message_reference"] = HashMap<String, Any?>().apply {
                put("channel_id", reference.a()?.toString())
                put("message_id", reference.c()?.toString())
                reference.b()?.let { put("guild_id", it.toString()) }
            }
            body["allowed_mentions"] = mapOf(
                "parse" to listOf("users", "roles", "everyone"),
                "replied_user" to reply.shouldMention,
            )
        }
        val channelId = message.channelId
        if (message.reply != null) MessageManager.`access$getStorePendingReplies$p`(message.messageManager).onDeletePendingReply(channelId)

        Utils.threadPool.execute {
            val ok = try {
                Http.Request.newDiscordRNRequest("/channels/$channelId/messages", "POST").executeWithJson(body).use { it.ok() }
            } catch (e: Throwable) {
                logger.error("Failed to send a silent message", e)
                false
            }
            if (ok) return@execute
            Utils.mainThread.post {
                Utils.showToast(I18n.t("Failed to send the silent message"))
                // Give the text back unless the user already typed something new
                val input = ChatInputs.current().firstOrNull()?.l() ?: return@post
                if (input.text.isNullOrEmpty() && StoreStream.getChannelsSelected().id == channelId) {
                    input.setText(typed)
                    input.setSelection(typed.length)
                }
            }
        }
    }

    private companion object {
        const val SUPPRESS_NOTIFICATIONS = 1 shl 12
    }
}
