/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.exportmessages

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.utils.GsonUtils
import com.aliucord.utils.GsonUtils.toJson
import com.aliucord.wrappers.embeds.MessageEmbedWrapper.Companion.description
import com.aliucord.wrappers.embeds.MessageEmbedWrapper.Companion.title
import com.aliucord.wrappers.embeds.MessageEmbedWrapper.Companion.url
import com.aliucord.wrappers.messages.AttachmentWrapper.Companion.filename
import com.aliucord.wrappers.messages.AttachmentWrapper.Companion.url
import com.discord.models.message.Message
import com.discord.stores.StoreStream
import com.discord.utilities.intent.IntentUtils
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.actionscommon.Files
import com.endcord.plugins.actionscommon.MessageParts
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

internal class ExportMessages : EndcordPlugin(
    name = "ExportMessages",
    description = "Allows you to export any message to a file",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            key = "shareAfterExport",
            label = "Share after export",
            description = "Open the share sheet with the exported text, so you can send it to another app",
            default = true,
        ),
        PluginSetting.Action(
            key = "exportContacts",
            label = "Copy contacts",
            description = "Copies your friends, blocked users and friend requests to the clipboard as JSON",
        ) { copyContacts() },
    )

    override fun start(context: Context) {
        MessageActions.register(name, "Export Message", R.e.ic_file_download_white_24dp) { ctx ->
            export(ctx.sheet.requireActivity(), ctx.message)
        }
    }

    private fun export(context: Context, message: Message) {
        val text = format(message)
        val millis = message.timestamp?.g() ?: System.currentTimeMillis()
        val day = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(Date(millis))
        val share = bool("shareAfterExport")

        Utils.threadPool.execute {
            try {
                val file = Files.writeToEndcordFolder("exports", "message-${message.id}-$day.txt", text)
                Common.ui {
                    Utils.showToast(I18n.t("Message exported successfully as {filename}", "filename" to file.absolutePath), true)
                    if (share) IntentUtils.performChooserSendIntent(context, text, I18n.t("Export Message"))
                }
            } catch (e: Throwable) {
                logger.errorToast(I18n.t("Failed to export message"), e)
            }
        }
    }

    /** Same layout as Endcord PC's export. */
    private fun format(message: Message): String {
        val author = message.author
        val time = Common.formatTime(message.timestamp?.g() ?: 0L)
        val sb = StringBuilder("[").append(time).append("] ").append(author?.username ?: I18n.t("Unknown"))
        val discriminator = author?.f() // discriminator
        if (!discriminator.isNullOrEmpty() && discriminator != "0" && discriminator != "0000") sb.append('#').append(discriminator)
        sb.append(": ").append(message.content.orEmpty())

        val attachments = MessageParts.attachments(message)
        if (attachments.isNotEmpty()) {
            sb.append("\n  Attachments:")
            for (a in attachments) sb.append("\n    - ").append(a.filename).append(" (").append(a.url).append(')')
        }
        val embeds = message.embeds.orEmpty()
        if (embeds.isNotEmpty()) {
            sb.append("\n  Embeds:")
            for (embed in embeds) {
                embed.title?.let { sb.append("\n    Title: ").append(it) }
                embed.description?.let { sb.append("\n    Description: ").append(it) }
                embed.url?.let { sb.append("\n    URL: ").append(it) }
            }
        }
        return sb.toString()
    }

    private fun copyContacts() {
        val relationships: Map<Long, Int> = StoreStream.getUserRelationships().relationships.orEmpty()
        val users = StoreStream.getUsers().users
        fun names(type: Int) = relationships.filter { it.value == type }.keys.mapNotNull { id ->
            val user = users[id] ?: return@mapNotNull null
            val discriminator = user.discriminator
            if (discriminator == 0) user.username else "${user.username}#${discriminator.toString().padStart(4, '0')}"
        }

        val contacts = linkedMapOf(
            "friendsAdded" to names(1),
            "blockedUsers" to names(2),
            "incomingFriendRequests" to names(3),
            "outgoingFriendRequests" to names(4),
        )
        Common.copy(GsonUtils.gson.toJson(contacts), "Contacts copied to clipboard successfully.")
    }
}
