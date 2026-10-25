/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.zerowidthsanitizer

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.api.OutgoingMessages

internal class ZeroWidthSanitizer : ComposerPlugin(
    name = "ZeroWidthSanitizer",
    description = "Removes invisible zero-width characters from messages to prevent fingerprinting and tracking",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch("sanitizeOutgoing", "Sanitize outgoing messages (before sending)", default = true),
        PluginSetting.Switch("sanitizeEdits", "Sanitize edited messages too", default = true),
        PluginSetting.Switch("showToastOnDetection", "Show a notification when invisible characters are detected", default = true),
        PluginSetting.Switch("verboseLogs", "Show detailed logs in console", "Written to the debug log", default = false),
    )

    override fun start(context: Context) {
        // Runs after the other text plugins, but before plugins that hide text in invisible characters on purpose
        onOutgoing(OutgoingMessages.Priority.SANITIZE + 10, onSend = true, onEdit = true) { message ->
            if (!bool(if (message.isEdit) "sanitizeEdits" else "sanitizeOutgoing")) return@onOutgoing
            val cleaned = sanitize(message.content)
            if (cleaned.length == message.content.length) return@onOutgoing

            message.content = cleaned
            if (bool("verboseLogs")) {
                logger.info(
                    if (message.isEdit) "Removed invisible characters from edited message ${message.editing?.id}"
                    else "Removed invisible characters from outgoing message in channel ${message.channelId}",
                )
            }
            if (bool("showToastOnDetection")) {
                Utils.showToast(
                    I18n.t(
                        if (message.isEdit) "ZeroWidthSanitizer: tracking characters removed from your edit"
                        else "ZeroWidthSanitizer: tracking characters removed from your message",
                    ),
                )
            }
        }
    }

    /**
     * Removes the invisible characters, except a zero-width joiner between two emoji: combined emoji such as 👩‍💻
     * and 🏳️‍🌈 are built with it and would otherwise fall apart into separate emoji.
     */
    private fun sanitize(text: String): String {
        val out = StringBuilder(text.length)
        for ((i, c) in text.withIndex()) {
            val keep = if (c == ZWJ) {
                out.isNotEmpty() && isEmoji(out.codePointBefore(out.length)) &&
                    i + 1 < text.length && isEmoji(text.codePointAt(i + 1))
            } else {
                !isInvisible(c)
            }
            if (keep) out.append(c)
        }
        return out.toString()
    }

    private companion object {
        const val ZWJ = '‍'

        fun isInvisible(c: Char) = c in '​'..'‏' || c in '‪'..'‮' || c in '⁠'..'⁤' ||
            c in '⁪'..'⁯' || c == '﻿' || c == '­'

        /** Emoji, skin tones, the emoji variation selector and the symbols combined emoji are made of (❤, ♀, ⚕...). */
        fun isEmoji(codePoint: Int) =
            codePoint >= 0x1F000 || codePoint == 0xFE0F || codePoint in 0x2600..0x27BF || codePoint in 0x2B00..0x2BFF
    }
}
