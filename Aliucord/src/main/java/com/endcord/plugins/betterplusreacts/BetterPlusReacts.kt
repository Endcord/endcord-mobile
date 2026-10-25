/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.betterplusreacts

import android.content.Context
import com.aliucord.Utils
import com.aliucord.i18n.I18n
import com.discord.stores.StoreStream
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.composercommon.ComposerUtils
import com.endcord.plugins.api.OutgoingMessages
import java.util.regex.Pattern

/**
 * The legacy Android app has no `+:emoji:` shortcut, so this adds it: sending `+` followed by a single emoji
 * reacts to the last message instead, `++` to the one before it, and so on.
 */
internal class BetterPlusReacts : ComposerPlugin(
    name = "BetterPlusReacts",
    description = "React to an earlier message by typing +:emoji:, with one + per message back",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "emotes")

    override fun start(context: Context) {
        onOutgoing(OutgoingMessages.Priority.ACTION) { message ->
            val content = message.content.trim()
            if (message.startsThread || !content.startsWith("+") || message.attachments.isNotEmpty()) return@onOutgoing
            val match = PLUS_REACT.matcher(content)
            if (!match.matches()) return@onOutgoing
            val emoji = resolveEmoji(match.group(2)!!) ?: return@onOutgoing

            val messages = ComposerUtils.loadedMessages(message.channelId)
            val target = messages.getOrNull(messages.size - match.group(1)!!.length)
            if (target == null) {
                Utils.showToast(I18n.t("There is no message to react to"))
                message.cancel(clearInput = false)
                return@onOutgoing
            }

            ComposerUtils.addReaction(message.channelId, target.id, emoji) { ok ->
                if (!ok) Utils.showToast(I18n.t("Couldn't add the reaction"))
            }
            message.cancel(clearInput = true)
        }
    }

    /** The reaction key of a custom (`<:name:id>`) or unicode emoji, or null when [text] isn't one emoji. */
    private fun resolveEmoji(text: String): String? {
        CUSTOM_EMOJI.matcher(text).let { if (it.matches()) return "${it.group(1)}:${it.group(2)}" }
        val emojis = try {
            StoreStream.getEmojis()
        } catch (e: Throwable) {
            return null
        }
        NAMED_EMOJI.matcher(text).let { if (it.matches()) return emojis.unicodeEmojisNamesMap?.get(it.group(1))?.surrogates }
        val surrogates = emojis.unicodeEmojiSurrogateMap ?: return null
        return when {
            surrogates.containsKey(text) -> text
            surrogates.containsKey(text.replace("️", "")) -> text
            else -> null
        }
    }

    private companion object {
        val PLUS_REACT: Pattern = Pattern.compile("^(\\++)\\s*(\\S+)$")
        val CUSTOM_EMOJI: Pattern = Pattern.compile("^<a?:(\\w+):(\\d+)>$")
        val NAMED_EMOJI: Pattern = Pattern.compile("^:([\\w+-]+):$")
    }
}
