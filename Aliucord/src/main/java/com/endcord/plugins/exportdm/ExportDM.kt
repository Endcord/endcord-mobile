/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.exportdm

import android.content.Context
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.tr
import com.aliucord.wrappers.ChannelWrapper.Companion.isDM
import com.aliucord.wrappers.ChannelWrapper.Companion.name
import com.aliucord.wrappers.ChannelWrapper.Companion.recipientIds
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.discord.stores.StoreStream
import com.endcord.plugins.commandscommon.BotMessages
import com.endcord.plugins.commandscommon.Net
import com.endcord.plugins.commandscommon.Options
import com.endcord.plugins.translatecommon.Downloads
import com.endcord.plugins.translatecommon.Rest
import org.json.JSONArray
import org.json.JSONObject
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * `/exportdm` saves the open DM or group DM to Downloads/Endcord as TXT, JSON, CSV, Markdown or HTML, with links to
 * its attachments, embeds, stickers and reactions, like Endcord PC's ExportDM.
 */
internal class ExportDM : EndcordPlugin(
    name = "ExportDM",
    description = DESCRIPTION,
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility", "privacy")

    private class Attachment(val url: String, val filename: String, val size: Long, val contentType: String)
    private class Embed(val title: String?, val description: String?, val url: String?, val image: String?, val type: String)
    private class Reaction(val emoji: String, val count: Int)
    private class Reply(val id: String, val authorName: String, val content: String)
    private class Msg(
        val id: String,
        val timestamp: String,
        val editedAt: String?,
        val authorId: String,
        val authorName: String,
        val authorAvatar: String?,
        val content: String,
        val attachments: List<Attachment>,
        val embeds: List<Embed>,
        val stickers: List<String>,
        val reactions: List<Reaction>,
        val reply: Reply?,
        val pinned: Boolean,
        val type: Int,
    )

    override fun start(context: Context) {
        commands.registerCommand(
            "exportdm",
            "Export this DM to a file",
            listOf(
                Options.string("format", "File format (html by default)", false, Options.choices("html", "txt", "md", "json", "csv")),
                Options.integer("limit", "Only export the newest messages, up to this many"),
            ),
        ) { ctx ->
            val channel = StoreStream.getChannels().getChannel(ctx.channelId)
            // 1 is a DM and 3 a group DM
            if (channel == null || !channel.isDM() || (channel.type != 1 && channel.type != 3)) {
                return@registerCommand CommandResult(tr("This only works in DMs and group DMs."), null, false)
            }
            val format = ctx.getStringOrDefault("format", "html").lowercase()
            val limit = ctx.getIntOrDefault("limit", 0).takeIf { it > 0 } ?: Int.MAX_VALUE
            val users = StoreStream.getUsers().users
            val channelName = channel.name.ifEmpty {
                channel.recipientIds.joinToString(", ") { users[it]?.username ?: it.toString() }.ifEmpty { ctx.channelId.toString() }
            }

            BotMessages.send(ctx.channelId, tr("Exporting... this can take a while for long conversations."))
            val messages = try {
                fetchAll(ctx.channelId, limit)
            } catch (e: Throwable) {
                logger.error("Failed to fetch messages", e)
                return@registerCommand CommandResult(tr("Couldn't fetch the messages: {reason}", "reason" to Net.describe(e)), null, false)
            }
            if (messages.isEmpty()) return@registerCommand CommandResult(tr("There are no messages to export."), null, false)

            val text = when (format) {
                "txt" -> buildTxt(messages, channelName)
                "md" -> buildMd(messages, channelName)
                "json" -> buildJson(messages, channelName)
                "csv" -> buildCsv(messages)
                else -> buildHtml(messages, channelName)
            }
            val ext = if (format in setOf("txt", "md", "json", "csv")) format else "html"
            val mime = Downloads.mimeOf("export.$ext")
            val stamp = SimpleDateFormat("yyyy-MM-dd_HH-mm", Locale.US).format(Date())
            val where = try {
                Downloads.save("dm_${Downloads.safeName(channelName)}_$stamp.$ext", mime, text.toByteArray(Charsets.UTF_8))
            } catch (e: Throwable) {
                logger.error("Failed to save the export", e)
                return@registerCommand CommandResult(tr("Couldn't save the file: {reason}", "reason" to (e.message ?: e.toString())), null, false)
            }
            CommandResult(tr("Exported {count} messages to {path}", "count" to messages.size, "path" to where), null, false)
        }
    }

    /** Pages through the channel's history, newest first, and returns it oldest first. */
    private fun fetchAll(channelId: Long, limit: Int): List<Msg> {
        val result = ArrayList<Msg>()
        var before: String? = null
        while (result.size < limit) {
            val page = minOf(100, limit - result.size)
            val route = "/channels/$channelId/messages?limit=$page" + (before?.let { "&before=$it" } ?: "")
            val batch = JSONArray(Rest.call(route))
            if (batch.length() == 0) break
            for (i in 0 until batch.length()) result += parse(batch.getJSONObject(i))
            before = result.last().id
            if (batch.length() < page) break
        }
        result.reverse()
        return result
    }

    private fun parse(m: JSONObject): Msg {
        val author = m.optJSONObject("author") ?: JSONObject()
        fun list(key: String): List<JSONObject> {
            val arr = m.optJSONArray(key) ?: return emptyList()
            val res = ArrayList<JSONObject>(arr.length())
            for (i in 0 until arr.length()) arr.optJSONObject(i)?.let { res += it }
            return res
        }
        val ref = m.optJSONObject("referenced_message")
        return Msg(
            id = m.optString("id"),
            timestamp = m.optString("timestamp"),
            editedAt = m.optString("edited_timestamp").takeIf { it.isNotEmpty() && it != "null" },
            authorId = author.optString("id"),
            authorName = displayName(author),
            authorAvatar = author.optString("avatar").takeIf { it.isNotEmpty() && it != "null" },
            content = m.optString("content"),
            attachments = list("attachments").map {
                Attachment(it.optString("url"), it.optString("filename"), it.optLong("size"), it.optString("content_type", "application/octet-stream"))
            },
            embeds = list("embeds").map {
                Embed(
                    it.optString("title").ifEmpty { null },
                    it.optString("description").ifEmpty { null },
                    it.optString("url").ifEmpty { null },
                    (it.optJSONObject("image") ?: it.optJSONObject("thumbnail"))?.optString("url")?.ifEmpty { null },
                    it.optString("type", "rich"),
                )
            },
            stickers = list("sticker_items").map { it.optString("name") },
            reactions = list("reactions").map {
                val emoji = it.optJSONObject("emoji")
                Reaction(emoji?.optString("name")?.ifEmpty { null } ?: emoji?.optString("id") ?: "?", it.optInt("count"))
            },
            reply = ref?.let { Reply(it.optString("id"), displayName(it.optJSONObject("author") ?: JSONObject()), it.optString("content").take(100)) },
            pinned = m.optBoolean("pinned"),
            type = m.optInt("type"),
        )
    }

    private fun displayName(author: JSONObject): String =
        author.optString("global_name").takeIf { it.isNotEmpty() && it != "null" } ?: author.optString("username", "?")

    private val dateFormat: DateFormat by lazy { DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT) }

    /** Discord's ISO timestamps (always UTC, with microseconds) in the device's local format. */
    private fun localTime(iso: String): String = try {
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
        dateFormat.format(parser.parse(iso.take(19))!!)
    } catch (_: Throwable) {
        iso
    }

    private fun mediaType(a: Attachment): String {
        val url = a.url.substringBefore('?').lowercase()
        return when {
            a.contentType.startsWith("image/") || IMAGE_EXT.any { url.endsWith(it) } -> "image"
            a.contentType.startsWith("video/") || VIDEO_EXT.any { url.endsWith(it) } -> "video"
            a.contentType.startsWith("audio/") || AUDIO_EXT.any { url.endsWith(it) } -> "audio"
            else -> "file"
        }
    }

    private fun size(bytes: Long): String = when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> String.format(Locale.US, "%.1f KB", bytes / 1024.0)
        else -> String.format(Locale.US, "%.1f MB", bytes / (1024.0 * 1024.0))
    }

    private fun title(channelName: String) = "${tr("Export DMs")} — $channelName"
    private fun exportedOn() = "${tr("Exported on")} ${dateFormat.format(Date())}"

    private fun buildTxt(messages: List<Msg>, channelName: String): String {
        val sb = StringBuilder("=== ${title(channelName)} ===\n${exportedOn()}\n${tr("Total:")} ${messages.size} ${tr("messages")}\n\n")
        for (m in messages) {
            m.reply?.let { sb.append("  > [").append(it.authorName).append("]: ").append(it.content).append('\n') }
            sb.append('[').append(localTime(m.timestamp)).append(']')
            if (m.editedAt != null) sb.append(' ').append(tr("(edited)"))
            sb.append(' ').append(m.authorName).append(": ").append(m.content).append('\n')
            for (a in m.attachments) sb.append("  [").append(mediaType(a).uppercase()).append("] ").append(a.filename)
                .append(" (").append(size(a.size)).append(") — ").append(a.url).append('\n')
            for (e in m.embeds) if (e.url != null) sb.append("  [LINK] ").append(e.title ?: "Embed").append(": ").append(e.url).append('\n')
            for (s in m.stickers) sb.append("  [STICKER] ").append(s).append('\n')
            if (m.reactions.isNotEmpty()) sb.append("  ").append(m.reactions.joinToString(" ") { "${it.emoji} x${it.count}" }).append('\n')
        }
        return sb.toString()
    }

    private fun buildMd(messages: List<Msg>, channelName: String): String {
        val sb = StringBuilder("# ${title(channelName)}\n> ${exportedOn()} · **${messages.size} ${tr("messages")}**\n\n")
        for (m in messages) {
            m.reply?.let { sb.append("> **").append(it.authorName).append("**: ").append(it.content).append('\n') }
            sb.append("**").append(m.authorName).append("** — *").append(localTime(m.timestamp)).append('*')
            if (m.editedAt != null) sb.append(' ').append(tr("(edited)"))
            if (m.pinned) sb.append(' ').append(tr("[pinned]"))
            sb.append('\n')
            if (m.content.isNotEmpty()) sb.append(m.content).append('\n')
            for (a in m.attachments) sb.append('[').append(a.filename).append("](").append(a.url).append(") *(").append(size(a.size)).append(")*\n")
            for (e in m.embeds) if (e.url != null) sb.append('[').append(e.title ?: "Link").append("](").append(e.url).append(")\n")
            for (s in m.stickers) sb.append("*Sticker: ").append(s).append("*\n")
            if (m.reactions.isNotEmpty()) sb.append(m.reactions.joinToString(" ") { "${it.emoji} `${it.count}`" }).append('\n')
            sb.append('\n')
        }
        return sb.toString()
    }

    private fun buildJson(messages: List<Msg>, channelName: String): String {
        val arr = JSONArray()
        for (m in messages) {
            arr.put(JSONObject().apply {
                put("id", m.id)
                put("timestamp", m.timestamp)
                put("editedAt", m.editedAt ?: JSONObject.NULL)
                put("authorId", m.authorId)
                put("authorName", m.authorName)
                put("authorAvatar", m.authorAvatar ?: JSONObject.NULL)
                put("content", m.content)
                put("attachments", JSONArray().apply {
                    for (a in m.attachments) put(JSONObject().put("url", a.url).put("filename", a.filename).put("size", a.size).put("contentType", a.contentType))
                })
                put("embeds", JSONArray().apply {
                    for (e in m.embeds) put(JSONObject().put("title", e.title).put("description", e.description).put("url", e.url).put("image", e.image).put("type", e.type))
                })
                put("stickers", JSONArray().apply { for (s in m.stickers) put(JSONObject().put("name", s)) })
                put("reactions", JSONArray().apply { for (r in m.reactions) put(JSONObject().put("emoji", r.emoji).put("count", r.count)) })
                m.reply?.let { put("referencedMessage", JSONObject().put("id", it.id).put("authorName", it.authorName).put("content", it.content)) }
                put("pinned", m.pinned)
                put("type", m.type)
            })
        }
        return JSONObject()
            .put("channel", channelName)
            .put("exported", SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date()))
            .put("count", messages.size)
            .put("messages", arr)
            .toString(2)
    }

    private fun buildCsv(messages: List<Msg>): String {
        fun esc(s: String?) = "\"" + (s ?: "").replace("\"", "\"\"") + "\""
        val sb = StringBuilder("\"ID\",\"Timestamp\",\"EditedAt\",\"AuthorID\",\"AuthorName\",\"Content\",\"Attachments\",\"Embeds\",\"Stickers\",\"Reactions\",\"ReplyTo\",\"Pinned\"\n")
        for (m in messages) {
            sb.append(listOf(
                m.id, m.timestamp, m.editedAt ?: "", m.authorId, m.authorName, m.content,
                m.attachments.joinToString("|") { it.url }, m.embeds.joinToString("|") { it.url ?: it.title ?: "" },
                m.stickers.joinToString("|"), m.reactions.joinToString("|") { "${it.emoji}:${it.count}" },
                m.reply?.id ?: "", if (m.pinned) "yes" else "no",
            ).joinToString(",") { esc(it) }).append('\n')
        }
        return sb.toString()
    }

    private fun html(s: String?) = (s ?: "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    private fun buildHtml(messages: List<Msg>, channelName: String): String {
        val sb = StringBuilder()
        sb.append("<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>")
            .append(html(title(channelName))).append("</title><style>").append(CSS).append("</style></head><body><h1>").append(html(channelName))
            .append("</h1><p class=\"meta\">").append(html(exportedOn())).append(" · ").append(messages.size).append(' ').append(html(tr("messages"))).append("</p>")
        for (m in messages) {
            val avatar = if (m.authorAvatar != null) "https://cdn.discordapp.com/avatars/${m.authorId}/${m.authorAvatar}.webp?size=32"
            else "https://cdn.discordapp.com/embed/avatars/${((m.authorId.toLongOrNull() ?: 0L) ushr 22) % 6}.png"
            sb.append("<div class=\"msg\">")
            m.reply?.let { sb.append("<div class=\"reply\"><b>").append(html(it.authorName)).append("</b>: ").append(html(it.content)).append("</div>") }
            sb.append("<div class=\"msg-header\"><img src=\"").append(avatar).append("\" class=\"avatar\"><span class=\"author\">").append(html(m.authorName))
                .append("</span><span class=\"ts\">").append(html(localTime(m.timestamp))).append("</span>")
            if (m.editedAt != null) sb.append("<span class=\"edited\">").append(html(tr("(edited)"))).append("</span>")
            if (m.pinned) sb.append("<span class=\"pin\">").append(html(tr("[pinned]"))).append("</span>")
            sb.append("</div>")
            if (m.content.isNotEmpty()) sb.append("<div class=\"content\">").append(html(m.content).replace("\n", "<br>")).append("</div>")
            for (a in m.attachments) {
                val url = html(a.url)
                when (mediaType(a)) {
                    "image" -> sb.append("<div class=\"media\"><img src=\"").append(url).append("\" alt=\"").append(html(a.filename)).append("\" loading=\"lazy\"><div class=\"media-name\">")
                        .append(html(a.filename)).append(" (").append(size(a.size)).append(")</div></div>")
                    "video" -> sb.append("<div class=\"media\"><video src=\"").append(url).append("\" controls preload=\"none\"></video><div class=\"media-name\">").append(html(a.filename)).append("</div></div>")
                    "audio" -> sb.append("<div class=\"media\"><audio src=\"").append(url).append("\" controls></audio><div class=\"media-name\">").append(html(a.filename)).append("</div></div>")
                    else -> sb.append("<div class=\"attachment\"><a href=\"").append(url).append("\">").append(html(a.filename)).append("</a> <span class=\"size\">").append(size(a.size)).append("</span></div>")
                }
            }
            for (e in m.embeds) {
                sb.append("<div class=\"embed\">")
                e.title?.let { sb.append("<div class=\"embed-title\">").append(html(it)).append("</div>") }
                e.description?.let { sb.append("<div class=\"embed-desc\">").append(html(it.take(300))).append("</div>") }
                e.image?.let { sb.append("<img src=\"").append(html(it)).append("\" class=\"embed-img\" loading=\"lazy\">") }
                e.url?.let { sb.append("<a href=\"").append(html(it)).append("\" class=\"embed-url\">").append(html(it)).append("</a>") }
                sb.append("</div>")
            }
            for (s in m.stickers) sb.append("<span class=\"sticker\">").append(html(s)).append("</span>")
            if (m.reactions.isNotEmpty()) {
                sb.append("<div class=\"reactions\">")
                for (r in m.reactions) sb.append("<span class=\"reaction\">").append(html(r.emoji)).append(' ').append(r.count).append("</span>")
                sb.append("</div>")
            }
            sb.append("</div>")
        }
        return sb.append("</body></html>").toString()
    }

    private companion object {
        const val DESCRIPTION = "Export a DM or group DM with /exportdm, with messages, links to its media, embeds, stickers and reactions, as TXT, JSON, CSV, MD or HTML."
        val IMAGE_EXT = listOf(".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg")
        val VIDEO_EXT = listOf(".mp4", ".webm", ".mov", ".avi", ".mkv")
        val AUDIO_EXT = listOf(".mp3", ".ogg", ".wav", ".flac", ".m4a")
        const val CSS = "*{box-sizing:border-box;margin:0;padding:0}body{background:#1e1f22;color:#dbdee1;font-family:system-ui,sans-serif;" +
            "padding:20px;max-width:900px;margin:0 auto}h1{color:#5865f2;margin-bottom:4px}.meta{color:#949ba4;font-size:13px;margin-bottom:24px}" +
            ".msg{padding:10px 12px;border-radius:4px;margin-bottom:2px}.msg-header{display:flex;align-items:center;gap:8px;margin-bottom:4px}" +
            ".avatar{width:32px;height:32px;border-radius:50%}.author{font-weight:700;color:#f2f3f5;font-size:14px}" +
            ".ts{font-size:11px;color:#949ba4;margin-left:4px}.edited,.pin{font-size:10px;color:#949ba4;margin-left:4px}" +
            ".reply{font-size:12px;color:#949ba4;padding:4px 8px;border-left:3px solid #4f545c;margin-bottom:6px;background:rgba(255,255,255,0.03)}" +
            ".content{font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word;margin-bottom:4px}.media{margin:6px 0}" +
            ".media img,.media video{max-width:100%;max-height:300px;border-radius:8px;display:block}.media-name{font-size:11px;color:#949ba4;margin-top:2px}" +
            ".attachment{padding:6px 10px;background:rgba(0,0,0,0.2);border-radius:4px;margin:4px 0;display:inline-block}.attachment a{color:#00aff4;text-decoration:none}" +
            ".embed{border-left:4px solid #5865f2;background:rgba(255,255,255,0.04);border-radius:0 4px 4px 0;padding:8px 12px;margin:6px 0}" +
            ".embed-title{font-weight:700;color:#00aff4;margin-bottom:4px}.embed-desc{font-size:13px}.embed-img{max-width:100%;border-radius:4px;margin-top:6px}" +
            ".embed-url{font-size:12px;color:#00aff4;display:block;margin-top:4px;text-decoration:none;word-break:break-all}" +
            ".sticker{font-size:12px;color:#b5bac1;background:rgba(255,255,255,0.06);border-radius:4px;padding:2px 6px;margin:2px}" +
            ".reactions{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.reaction{background:rgba(255,255,255,0.08);border-radius:8px;padding:2px 8px;font-size:12px}audio{width:300px;margin-top:4px}"
    }
}
