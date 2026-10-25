/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.previewmessage

import android.content.Context
import com.aliucord.Utils
import com.aliucord.i18n.I18n
import com.aliucord.utils.ReflectUtils
import com.discord.api.message.MessageFlags
import com.discord.models.message.Message
import com.discord.stores.StoreMessages
import com.discord.stores.StoreStream
import com.discord.utilities.message.LocalMessageCreatorsKt
import com.discord.utilities.time.ClockFactory
import com.endcord.plugins.composercommon.ComposerPlugin

/**
 * Shows what you typed as a message only you can see, rendered like Discord would render it.
 * Attachments are not part of the preview.
 */
internal class PreviewMessage : ComposerPlugin(
    name = "PreviewMessage",
    description = "Lets you preview your message before sending it.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override fun start(context: Context) {
        composerAction("Preview Message", visible = { true }) { input ->
            val content = input.sendableText
            if (content.isBlank()) {
                Utils.showToast(I18n.t("Type a message to preview it"))
                return@composerAction
            }
            showPreview(input.channelId, content)
        }
    }

    private fun showPreview(channelId: Long, content: String) {
        val me = StoreStream.getUsers().me
        // A local, ephemeral message: never sent, gone after a restart, dismissable like a command reply
        val preview = LocalMessageCreatorsKt.createLocalMessage(
            content, channelId, Utils.buildClyde(me.username, null), null, false, false, null, null,
            ClockFactory.get(), null, null, null, null, null, null, null, null,
        )
        ReflectUtils.setField(Message::class.java, preview, "flags", MessageFlags.EPHEMERAL)
        StoreMessages.`access$handleLocalMessageCreate`(StoreStream.getMessages(), preview)
    }
}
