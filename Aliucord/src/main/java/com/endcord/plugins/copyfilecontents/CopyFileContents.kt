/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.copyfilecontents

import android.content.Context
import com.aliucord.Http
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.messages.AttachmentWrapper.Companion.filename
import com.aliucord.wrappers.messages.AttachmentWrapper.Companion.size
import com.aliucord.wrappers.messages.AttachmentWrapper.Companion.url
import com.discord.api.message.attachment.MessageAttachment
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.actionscommon.MessageParts
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R

internal class CopyFileContents : EndcordPlugin(
    name = "CopyFileContents",
    description = "Adds a button to text file attachments to copy their contents",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility")

    override fun start(context: Context) {
        MessageActions.register(
            name,
            "Copy File Contents",
            R.e.ic_copy_24dp,
            visible = { ctx -> MessageParts.attachments(ctx.message).any { MessageParts.isText(it) } },
        ) { ctx ->
            val files = MessageParts.attachments(ctx.message).filter { MessageParts.isText(it) }
            if (files.size == 1) {
                copyContents(files[0])
            } else {
                Common.pick(ctx.sheet.parentFragmentManager, I18n.t("Copy File Contents"), files.map { it.filename }) {
                    copyContents(files[it])
                }
            }
        }
    }

    private fun copyContents(file: MessageAttachment) {
        // Android's clipboard goes through a binder transaction that fails past about 1 MB
        if (file.size > MAX_BYTES) {
            Utils.showToast(I18n.t("File too large to copy"))
            return
        }
        val url = file.url
        val name = file.filename
        Utils.threadPool.execute {
            try {
                val text = Http.Request(url).use { req ->
                    req.execute().use { res ->
                        res.assertOk()
                        res.text()
                    }
                }
                if (text.length > MAX_BYTES) {
                    Utils.showToast(I18n.t("File too large to copy"))
                    return@execute
                }
                Common.ui {
                    Utils.setClipboard(name, text)
                    Utils.showToast(I18n.t("Copied!"))
                }
            } catch (e: Throwable) {
                logger.errorToast(I18n.t("Failed to download the file"), e)
            }
        }
    }

    private companion object {
        const val MAX_BYTES = 256 * 1024
    }
}
