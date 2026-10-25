/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.decodebase64

import android.content.Context
import android.util.Base64
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.tr
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.commandscommon.Dialogs
import com.endcord.plugins.commandscommon.Patterns
import com.lytefast.flexinput.R
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.util.regex.Pattern

internal class DecodeBase64 : EndcordPlugin(
    name = "DecodeBase64",
    description = "Decode base64 content of any message and copy the decoded content.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    // Same pattern as Endcord PC
    private val base64 = Pattern.compile("\\b[A-Za-z0-9+/]{4,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?\\b")

    override fun start(context: Context) {
        MessageActions.register(
            name,
            "Decode Base64",
            R.e.ic_key_24dp,
            visible = { decodeAll(it.message.content).isNotEmpty() },
        ) { actx ->
            val decoded = decodeAll(actx.message.content)
            val activity = actx.sheet.activity ?: return@register
            when (decoded.size) {
                0 -> return@register
                1 -> Dialogs.showText(activity, tr("Decoded Base64 Content"), decoded[0])
                // Several strings: tap one to copy it
                else -> Dialogs.showList(activity, tr("Decoded Base64 Content"), decoded) { Dialogs.copy(decoded[it]) }
            }
        }
    }

    /** Every base64 string in [content] that decodes to readable UTF-8 text. */
    private fun decodeAll(content: String?): List<String> {
        if (content.isNullOrEmpty()) return emptyList()
        return Patterns.findAll(base64, content).mapNotNull { decode(it) }.distinct()
    }

    private fun decode(value: String): String? {
        val bytes = try {
            Base64.decode(value, Base64.DEFAULT)
        } catch (_: IllegalArgumentException) {
            return null
        }
        if (bytes.isEmpty()) return null
        val text = try {
            Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes))
                .toString()
        } catch (_: CharacterCodingException) {
            return null
        }
        // Plain words often "decode" to control characters; that isn't real content
        return text.takeIf { s -> s.none { it.isISOControl() && it != '\n' && it != '\r' && it != '\t' } }
    }
}
