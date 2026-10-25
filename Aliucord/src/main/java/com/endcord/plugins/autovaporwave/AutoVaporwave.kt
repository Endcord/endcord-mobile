/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.autovaporwave

import android.content.Context
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.composercommon.OutgoingMessages

internal class AutoVaporwave : ComposerPlugin(
    name = "AutoVaporwave",
    description = "Turn every message you send into ｆｕｌｌｗｉｄｔｈ text automatically.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "fun")

    override fun start(context: Context) {
        onOutgoing(OutgoingMessages.Priority.STYLE + 50) { message ->
            if (message.content.isNotEmpty()) message.content = toFullwidth(message.content)
        }
    }

    private fun toFullwidth(text: String): String {
        val out = StringBuilder(text.length)
        for (c in text) {
            out.append(
                when (c) {
                    ' ' -> '　'
                    in '!'..'~' -> c + 0xFEE0
                    else -> c
                },
            )
        }
        return out.toString()
    }
}
