/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.downloadallattachments

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.messages.AttachmentWrapper.Companion.filename
import com.aliucord.wrappers.messages.AttachmentWrapper.Companion.url
import com.endcord.plugins.actionscommon.Files
import com.endcord.plugins.actionscommon.MessageParts
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R

internal class DownloadAllAttachments : EndcordPlugin(
    name = "DownloadAllAttachments",
    description = "Adds a message action to download all attachments in a message at once.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility", "chat")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            key = "downloadAllFileTypes",
            label = "Download all file types",
            description = "Also download non-media attachments. Only enable this if you trust what people send you.",
        ),
    )

    override fun start(context: Context) {
        MessageActions.register(
            name,
            "Download All Attachments",
            R.e.ic_file_download_white_24dp,
            visible = { ctx ->
                val attachments = MessageParts.attachments(ctx.message)
                attachments.isNotEmpty() && (bool("downloadAllFileTypes") || attachments.any { MessageParts.isMedia(it) })
            },
        ) { ctx -> downloadAll(ctx.sheet.requireContext().applicationContext, ctx.message) }
    }

    private fun downloadAll(context: Context, message: com.discord.models.message.Message) {
        val all = MessageParts.attachments(message)
        val wanted = if (bool("downloadAllFileTypes")) all else all.filter { MessageParts.isMedia(it) }

        // Files of one message often share a name (image.png), keep them apart like Endcord PC does
        val used = HashMap<String, Int>()
        var queued = 0
        for (attachment in wanted) {
            val original = Files.sanitize(attachment.filename)
            val count = used[original] ?: 0
            used[original] = count + 1
            val name = if (count == 0) original else {
                val dot = original.lastIndexOf('.')
                if (dot <= 0) "${original}_$count" else "${original.substring(0, dot)}_$count${original.substring(dot)}"
            }
            try {
                Files.download(context, attachment.url, name)
                queued++
            } catch (e: Throwable) {
                logger.error("Failed to queue ${attachment.filename}", e)
            }
        }

        val skipped = all.size - wanted.size
        val failed = wanted.size - queued
        Utils.showToast(
            when {
                failed > 0 -> I18n.t("Downloading {done} of {total} attachments. {failed} failed.", "done" to queued, "total" to wanted.size, "failed" to failed)
                skipped > 0 -> I18n.t("Downloading {count} attachments to Download/Endcord, skipped {skipped} files that aren't media.", "count" to queued, "skipped" to skipped)
                else -> I18n.t("Downloading {count} attachments to Download/Endcord.", "count" to queued)
            },
            true,
        )
    }
}
