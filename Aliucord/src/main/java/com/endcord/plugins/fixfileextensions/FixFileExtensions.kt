/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.fixfileextensions

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.patcher.before
import com.discord.utilities.rest.SendUtils
import com.lytefast.flexinput.model.Attachment
import java.lang.reflect.Field
import java.util.Locale
import java.util.regex.Pattern

internal class FixFileExtensions : EndcordPlugin(
    name = "FixFileExtensions",
    description = "Fixes file extensions by renaming them to a compatible supported format if possible",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("media", "utility")

    override fun start(context: Context) {
        // Every upload (messages and slash command options) gets its final file names here, right before the
        // request is built. AnonymiseFileNames renames in the same place and keeps the extension, so the two
        // work together in either order.
        patcher.before<SendUtils>("uniqueifyNames", List::class.java) { param ->
            val attachments = param.args[0] as? List<*> ?: return@before
            for (attachment in attachments) {
                if (attachment is Attachment<*>) fix(attachment)
            }
        }
    }

    private fun fix(attachment: Attachment<*>) {
        val original = attachment.displayName ?: return
        val tar = TAR_EXTENSION.matcher(original)
        val extIndex = if (tar.find()) tar.start() else original.lastIndexOf('.')
        if (extIndex < 0) return
        val replacement = REVERSE_EXTENSIONS[original.substring(extIndex).toLowerCase(Locale.ROOT)] ?: return
        displayNameField.set(attachment, original.substring(0, extIndex) + replacement)
    }

    private companion object {
        val TAR_EXTENSION: Pattern = Pattern.compile("\\.tar\\.\\w+$")

        /** Same table as Endcord PC: target extension to the extensions that get renamed to it. */
        val REVERSE_EXTENSIONS: Map<String, String> = HashMap<String, String>().apply {
            val map = mapOf(
                "ogg" to listOf(".ogv", ".oga", ".ogx", ".ogm", ".spx", ".aac", ".wma"),
                "jpg" to listOf(".jpe", ".jif", ".jfi", ".pjpeg", ".pjp", ".bmp", ".tiff", ".tif"),
                "svg" to listOf(".svgz", ".ai", ".eps"),
                "mp4" to listOf(".m4v", ".m4r", ".m4p", ".avi", ".mkv", ".wmv", ".flv", ".3gp"),
                "m4a" to listOf(".m4b", ".aiff"),
                "mov" to listOf(".movie", ".qt", ".asf", ".rm", ".rmvb"),
                "png" to listOf(".ico", ".cur"),
            )
            for ((target, extensions) in map) for (ext in extensions) put(ext, ".$target")
        }

        val displayNameField: Field by lazy {
            Attachment::class.java.getDeclaredField("displayName").apply { isAccessible = true }
        }
    }
}
