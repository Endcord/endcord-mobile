/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.talkinreverse

import android.content.Context
import com.aliucord.Utils
import com.aliucord.i18n.I18n
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.composercommon.OutgoingMessages

internal class TalkInReverse : ComposerPlugin(
    name = "TalkInReverse",
    description = "Reverses the message content before sending it.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "fun")

    /** Like the chat bar toggle on Endcord PC, this starts off every time the app starts. */
    private var enabled = false

    override fun start(context: Context) {
        composerAction("Reverse messages", checked = { enabled }) {
            enabled = !enabled
            Utils.showToast(I18n.t(if (enabled) "Reversed messages on" else "Reversed messages off"))
        }

        onOutgoing(OutgoingMessages.Priority.STYLE + 60) { message ->
            if (enabled && message.content.isNotEmpty()) message.content = reverse(message.content)
        }
    }

    override fun stop(context: Context) {
        enabled = false
        super.stop(context)
    }

    private fun reverse(text: String): String {
        // By code point so emoji and other surrogate pairs survive
        val codePoints = text.codePoints().toArray()
        codePoints.reverse()
        return String(codePoints, 0, codePoints.size)
    }
}
