/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.anonymisefilenames

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.before
import com.discord.utilities.rest.SendUtils
import com.lytefast.flexinput.model.Attachment
import java.lang.reflect.Field
import kotlin.random.Random

internal class AnonymiseFileNames : EndcordPlugin(
    name = "AnonymiseFileNames",
    description = "Anonymise uploaded file names",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("privacy", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            key = "method",
            label = "Anonymising method",
            options = listOf(
                PluginSetting.Choice.Option("random", "Random Characters"),
                PluginSetting.Choice.Option("consistent", "Consistent"),
                PluginSetting.Choice.Option("timestamp", "Timestamp"),
            ),
        ),
        PluginSetting.Number("randomisedLength", "Random characters length", default = 7, min = 1, max = 64),
        PluginSetting.Text("consistent", "Consistent filename", default = "image"),
    )

    override fun start(context: Context) {
        // Every upload (messages and slash command options) gets its final file names here, right before
        // the request is built, so renaming the attachments in place covers all of them.
        patcher.before<SendUtils>("uniqueifyNames", List::class.java) { param ->
            val attachments = param.args[0] as? List<*> ?: return@before
            for (attachment in attachments) {
                if (attachment is Attachment<*>) anonymise(attachment)
            }
        }
    }

    private fun anonymise(attachment: Attachment<*>) {
        val original = attachment.displayName ?: return
        val tarIndex = TAR_EXTENSION.find(original, 0)?.range?.first
        val extIndex = tarIndex ?: original.lastIndexOf('.')
        val ext = if (extIndex >= 0) original.substring(extIndex) else ""

        val name = when (choice("method")) {
            "consistent" -> string("consistent").ifEmpty { "image" }
            "timestamp" -> System.currentTimeMillis().toString()
            else -> {
                val length = int("randomisedLength").coerceIn(1, 64)
                String(CharArray(length) { RANDOM_CHARS[Random.nextInt(RANDOM_CHARS.length)] })
            }
        }
        displayNameField.set(attachment, name + ext)
    }

    private companion object {
        const val RANDOM_CHARS = "0123456789bdfhjkmnpqrstvwxz"
        val TAR_EXTENSION = Regex("\\.tar\\.\\w+$")
        val displayNameField: Field by lazy {
            Attachment::class.java.getDeclaredField("displayName").apply { isAccessible = true }
        }
    }
}
