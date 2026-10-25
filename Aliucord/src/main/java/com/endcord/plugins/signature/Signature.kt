/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.signature

import android.content.Context
import com.aliucord.Utils
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.discord.api.commands.ApplicationCommandType
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.api.OutgoingMessages

internal class Signature : ComposerPlugin(
    name = "Signature",
    description = "Automated fingerprint/end text",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "chat")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            key = "name",
            label = "The signature that will be added to the end of your messages",
            default = "a chronic discord user",
        ),
        PluginSetting.Text(
            key = "textHeader",
            label = "What header to preface text with",
            default = ">",
        ),
        PluginSetting.Switch(
            key = "isEnabled",
            label = "Toggle functionality",
            description = "Also available from the long-press menu of the send button and with /signature",
            default = true,
        ),
    )

    override fun start(context: Context) {
        onOutgoing(OutgoingMessages.Priority.APPEND) { message ->
            if (!bool("isEnabled")) return@onOutgoing
            val header = string("textHeader")
            message.content = "${message.content}\n${if (header.isNotEmpty()) "$header " else ""}${string("name")}"
        }

        composerAction("Enable Signature", checked = { bool("isEnabled") }) {
            setEnabled(!bool("isEnabled"))
            Utils.showToast(I18n.t(if (bool("isEnabled")) "Signature enabled!" else "Signature disabled!"))
        }

        commands.registerCommand(
            "signature",
            "Toggle your signature",
            listOf(
                Utils.createCommandOption(
                    ApplicationCommandType.BOOLEAN,
                    "value",
                    "Toggle your signature (default is toggle)",
                ),
            ),
        ) { ctx ->
            setEnabled(ctx.getBool("value") ?: !bool("isEnabled"))
            CommandResult(I18n.t(if (bool("isEnabled")) "Signature enabled!" else "Signature disabled!"), null, false)
        }
    }

    private fun setEnabled(value: Boolean) = settings.setBool("isEnabled", value)
}
