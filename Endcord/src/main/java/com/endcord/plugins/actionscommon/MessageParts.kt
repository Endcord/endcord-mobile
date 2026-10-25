/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.actionscommon

import com.aliucord.wrappers.embeds.ImageWrapper.Companion.url
import com.aliucord.wrappers.embeds.MessageEmbedWrapper.Companion.rawImage
import com.aliucord.wrappers.embeds.MessageEmbedWrapper.Companion.rawThumbnail
import com.aliucord.wrappers.embeds.MessageEmbedWrapper.Companion.rawVideo
import com.aliucord.wrappers.embeds.MessageEmbedWrapper.Companion.url
import com.aliucord.wrappers.embeds.ThumbnailWrapper.Companion.url
import com.aliucord.wrappers.embeds.VideoWrapper.Companion.url
import com.aliucord.wrappers.messages.AttachmentWrapper.Companion.filename
import com.aliucord.wrappers.messages.AttachmentWrapper.Companion.type
import com.aliucord.wrappers.messages.AttachmentWrapper.Companion.url
import com.discord.api.message.attachment.MessageAttachment
import com.discord.api.message.attachment.MessageAttachmentType
import com.discord.api.sticker.BaseSticker
import com.discord.models.message.Message

/** Pulls the pieces the message action ports work with out of a message. */
internal object MessageParts {
    /** A piece of media in a message and a short label for pickers. */
    class Media(val url: String, val label: String, val isVideo: Boolean)

    /** A custom emoji in a message. */
    class CustomEmoji(val id: String, val name: String, val animated: Boolean) {
        val markdown: String get() = "<${if (animated) "a" else ""}:$name:$id>"
    }

    private val customEmojiRegex = Regex("<(a?):(\\w+):(\\d+)>")

    private val textExtensions = hashSetOf(
        "txt", "md", "markdown", "log", "csv", "tsv", "json", "jsonc", "json5", "xml", "html", "htm", "css", "scss",
        "less", "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "java", "kt", "kts", "c", "h", "cc", "cpp", "hpp", "cxx",
        "cs", "go", "rs", "rb", "php", "lua", "swift", "sh", "bash", "zsh", "fish", "bat", "cmd", "ps1", "sql", "yml",
        "yaml", "toml", "ini", "cfg", "conf", "properties", "gradle", "env", "diff", "patch", "srt", "vtt", "tex",
        "dart", "scala", "clj", "ex", "exs", "erl", "hs", "ml", "r", "pl", "vue", "svelte", "asm", "s", "nix", "zig",
    )

    fun attachments(message: Message): List<MessageAttachment> = message.attachments.orEmpty()

    fun isMedia(attachment: MessageAttachment): Boolean = try {
        attachment.type != MessageAttachmentType.FILE
    } catch (_: Throwable) {
        false
    }

    /** Whether an attachment looks like text that can be shown or copied. */
    fun isText(attachment: MessageAttachment): Boolean {
        val name = attachment.filename.lowercase()
        val dot = name.lastIndexOf('.')
        if (dot < 0 || dot == name.length - 1) return false
        return name.substring(dot + 1) in textExtensions && !isMedia(attachment)
    }

    /** Images and videos of a message: attachments first, then embeds. Original URLs, not the media proxy. */
    fun media(message: Message): List<Media> {
        val out = LinkedHashMap<String, Media>()
        for (attachment in attachments(message)) {
            if (!isMedia(attachment)) continue
            val url = attachment.url
            val video = try {
                attachment.type == MessageAttachmentType.VIDEO
            } catch (_: Throwable) {
                false
            }
            if (url.isNotEmpty()) out[url] = Media(url, attachment.filename, video)
        }
        for (embed in message.embeds.orEmpty()) {
            val urls = listOf(
                safe { embed.rawVideo?.url } to true,
                safe { embed.rawImage?.url } to false,
                safe { embed.rawThumbnail?.url } to false,
            )
            for ((url, video) in urls) {
                if (url.isNullOrEmpty() || url in out) continue
                out[url] = Media(url, labelFor(url), video)
                break // one url per embed: the video, else the image, else the thumbnail
            }
        }
        return out.values.toList()
    }

    /** Links of the message's embeds, for embeds that point somewhere. */
    fun embedUrls(message: Message): List<String> =
        message.embeds.orEmpty().mapNotNull { safe { it.url } }.filter { it.isNotEmpty() }

    /** Custom emojis used in the text and the reactions of a message, without duplicates. */
    fun customEmojis(message: Message): List<CustomEmoji> {
        val out = LinkedHashMap<String, CustomEmoji>()
        val content = message.content
        if (!content.isNullOrEmpty() && content.indexOf('<') >= 0) {
            for (match in customEmojiRegex.findAll(content, 0)) {
                val id = match.groupValues[3]
                if (id !in out) out[id] = CustomEmoji(id, match.groupValues[2], match.groupValues[1] == "a")
            }
        }
        for (reaction in message.reactions.orEmpty()) {
            val emoji = reaction.b() ?: continue // emoji
            val id = emoji.b() ?: continue // id, null for unicode emojis
            val name = emoji.d() ?: continue // name
            if (id !in out) out[id] = CustomEmoji(id, name, emoji.a())
        }
        return out.values.toList()
    }

    /** Whether [customEmojis] would find anything, without building the list. */
    fun hasCustomEmojis(message: Message): Boolean {
        val content = message.content
        if (!content.isNullOrEmpty() && content.indexOf('<') >= 0 && customEmojiRegex.containsMatchIn(content)) return true
        return message.reactions.orEmpty().any { it.b()?.b() != null }
    }

    /** Stickers of a message, from the new sticker items or the old full sticker objects. */
    fun stickers(message: Message): List<BaseSticker> {
        val items = message.stickerItems
        if (!items.isNullOrEmpty()) return items
        return message.stickers.orEmpty()
    }

    private fun labelFor(url: String): String {
        val path = url.substringBefore('?').trimEnd('/')
        val last = path.substringAfterLast('/')
        return if (last.isEmpty()) url else last
    }

    private inline fun <T> safe(block: () -> T?): T? = try {
        block()
    } catch (_: Throwable) {
        null
    }
}
