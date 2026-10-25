/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.sedenhanced

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.discord.models.message.Message
import com.discord.stores.StoreStream
import com.discord.widgets.chat.MessageManager
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.composercommon.ComposerUtils
import com.endcord.plugins.composercommon.OutgoingMessage
import com.endcord.plugins.composercommon.OutgoingMessages
import java.util.regex.Matcher
import java.util.regex.Pattern

/**
 * The legacy Android app has no `s/find/replace` support at all, so this implements all of it:
 * sending `s/find/replace/flags` edits your last message (or the message you are replying to) instead of
 * being sent.
 */
internal class SedEnhanced : ComposerPlugin(
    name = "SedEnhanced",
    description = "Expands on Discord's rudimentary `sed` support.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            key = "regexByDefault",
            label = "Inverts the `r` flag, so using the `r` flag enables non-regex mode, and omitting it uses regex mode.",
            default = false,
        ),
    )

    override fun start(context: Context) {
        onOutgoing(OutgoingMessages.Priority.ACTION) { message ->
            if (message.hasNoSedShape()) return@onOutgoing
            val matcher = SED.matcher(message.content)
            if (matcher.matches()) searchReplace(message, matcher)
        }
    }

    private fun OutgoingMessage.hasNoSedShape() = content.length < 4 || content[0] != 's' || attachments.isNotEmpty()

    private fun searchReplace(message: OutgoingMessage, groups: Matcher) {
        val me = ComposerUtils.myId()
        val replyId = message.reply?.messageReference?.c()
        val target: Message? = if (replyId != null) {
            StoreStream.getMessages().getMessage(message.channelId, replyId)
        } else {
            ComposerUtils.loadedMessages(message.channelId).lastOrNull {
                ComposerUtils.authorId(it) == me && ComposerUtils.isTextMessage(it)
            }
        }
        if (target == null || ComposerUtils.authorId(target) != me) {
            Utils.showToast(I18n.t("There is no message of yours to edit"))
            message.cancel(clearInput = false)
            return
        }

        var pattern = groups.group(2) ?: ""
        var replace = groups.group(3) ?: ""
        val modes = groups.group(4) ?: ""
        val isRegex = ('r' in modes) != bool("regexByDefault")
        val global = 'g' in modes
        val original = target.content ?: ""

        val replaced = try {
            if (isRegex) {
                var flags = 0
                if ('i' in modes) flags = flags or Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE
                if ('m' in modes) flags = flags or Pattern.MULTILINE
                if ('s' in modes) flags = flags or Pattern.DOTALL
                val matcher = Pattern.compile(pattern, flags).matcher(original)
                val javaReplacement = toJavaReplacement(replace)
                if (global) matcher.replaceAll(javaReplacement) else matcher.replaceFirst(javaReplacement)
            } else {
                pattern = ESCAPED.matcher(pattern).replaceAll("$1")
                replace = ESCAPED.matcher(replace).replaceAll("$1")
                if (global) original.replace(pattern, replace) else original.replaceFirst(pattern, replace)
            }
        } catch (e: Throwable) {
            // An invalid regex is swallowed like on Endcord PC
            message.cancel(clearInput = true)
            return
        }

        if (replaced.isBlank() && target.attachments.isNullOrEmpty()) {
            ComposerUtils.deleteMessage(target.channelId, target.id)
        } else if (replaced != original) {
            ComposerUtils.editMessage(target.channelId, target.id, replaced)
        }
        if (replyId != null) MessageManager.`access$getStorePendingReplies$p`(message.messageManager).onDeletePendingReply(message.channelId)
        message.cancel(clearInput = true)
    }

    /** JavaScript replacement syntax (`$&`, `$1`, `$$`, literal backslashes) to Java's. */
    private fun toJavaReplacement(js: String): String {
        val out = StringBuilder(js.length + 8)
        var i = 0
        while (i < js.length) {
            val c = js[i]
            val next = js.getOrNull(i + 1)
            when {
                c == '\\' -> out.append("\\\\")
                c == '$' && next == '&' -> {
                    out.append("$0")
                    i++
                }
                c == '$' && next != null && next.isDigit() -> out.append('$')
                c == '$' && next == '$' -> {
                    out.append("\\$")
                    i++
                }
                c == '$' -> out.append("\\$")
                else -> out.append(c)
            }
            i++
        }
        return out.toString()
    }

    private companion object {
        /** Endcord PC's sed syntax with numbered instead of named groups: separator, match, replace, modes. */
        val SED: Pattern = Pattern.compile(
            "^s([/|$#@!])((?!\\1)(?:(?![^\\\\]\\1).)*.|)\\1((?!\\1)(?:(?![^\\\\]\\1).)*.|)\\1?([rgmisudyv]*)$",
        )
        val ESCAPED: Pattern = Pattern.compile("\\\\([*?+/])")
    }
}
