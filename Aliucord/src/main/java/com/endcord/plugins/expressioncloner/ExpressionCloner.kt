/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.expressioncloner

import android.content.Context
import android.util.Base64
import com.aliucord.Http
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.tr
import com.aliucord.utils.IOUtils
import com.aliucord.wrappers.stickers.StickerPartialWrapper.Companion.formatType
import com.aliucord.wrappers.stickers.StickerPartialWrapper.Companion.id
import com.aliucord.wrappers.stickers.StickerPartialWrapper.Companion.name
import com.discord.api.sticker.StickerFormatType
import com.discord.models.message.Message
import com.discord.stores.StoreStream
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.commandscommon.Dialogs
import com.endcord.plugins.commandscommon.Net
import com.endcord.plugins.translatecommon.Rest
import com.lytefast.flexinput.R
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.regex.Pattern

/**
 * Long-press a message with custom emojis or a sticker and pick "Clone emoji or sticker" to add it to one of your
 * servers where you can manage expressions. Endcord PC does this from the right-click menu of the emoji itself.
 */
internal class ExpressionCloner : EndcordPlugin(
    name = "ExpressionCloner",
    description = DESCRIPTION,
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("emotes", "servers")

    private class Expression(val name: String, val id: Long, val url: String, val sticker: Boolean, val label: String)

    override fun start(context: Context) {
        MessageActions.register(name, "Clone emoji or sticker", R.e.ic_emoji_24dp, visible = { ctx ->
            hasExpressions(ctx.message)
        }) { ctx ->
            val activity = ctx.sheet.requireActivity()
            val items = expressions(ctx.message)
            if (items.isEmpty()) return@register
            if (items.size == 1) pickGuild(activity, items[0])
            else Dialogs.showList(activity, tr("Clone emoji or sticker"), items.map { it.label }) { pickGuild(activity, items[it]) }
        }
    }

    private fun hasExpressions(message: Message): Boolean {
        if (!message.stickerItems.isNullOrEmpty()) return true
        val content = message.content ?: return false
        return content.indexOf("<") >= 0 && CUSTOM_EMOJI.matcher(content).find()
    }

    private fun expressions(message: Message): List<Expression> {
        val res = ArrayList<Expression>()
        val seen = HashSet<Long>()
        val content = message.content
        if (content != null) {
            val m = CUSTOM_EMOJI.matcher(content)
            while (m.find()) {
                val id = m.group(3)!!.toLong()
                if (!seen.add(id)) continue
                val animated = m.group(1) != null
                val name = m.group(2)!!
                val url = "https://cdn.discordapp.com/emojis/$id.${if (animated) "gif" else "png"}?size=128&quality=lossless"
                res += Expression(name, id, url, false, ":$name:")
            }
        }
        message.stickerItems?.forEach { sticker ->
            if (!seen.add(sticker.id)) return@forEach
            val ext = when (sticker.formatType) {
                StickerFormatType.LOTTIE -> return@forEach // Only partnered servers can upload Lottie stickers
                // GIF stickers are newer than this app, which reports them as unknown
                StickerFormatType.UNKNOWN -> "gif"
                else -> "png"
            }
            val url = "https://media.discordapp.net/stickers/${sticker.id}.$ext?size=320&passthrough=true"
            res += Expression(sticker.name, sticker.id, url, true, tr("Sticker: {name}", "name" to sticker.name))
        }
        return res
    }

    private fun pickGuild(context: Context, item: Expression) {
        val perms = StoreStream.getPermissions().guildPermissions
        val guilds = StoreStream.getGuilds().guilds.values
            .filter { guild -> perms[guild.id]?.let { it and (ADMINISTRATOR or MANAGE_EXPRESSIONS) != 0L } == true }
            .sortedBy { it.name?.lowercase() ?: "" }
        if (guilds.isEmpty()) {
            Utils.showToast(tr("You can't add emojis or stickers to any of your servers."), true)
            return
        }
        Dialogs.showList(context, tr("Clone {name} to", "name" to item.label), guilds.map { it.name ?: it.id.toString() }) { index ->
            val guild = guilds[index]
            Utils.showToast(tr("Cloning..."))
            Utils.threadPool.execute { clone(item, guild.id, guild.name ?: guild.id.toString()) }
        }
    }

    private fun clone(item: Expression, guildId: Long, guildName: String) {
        try {
            val bytes = Net.getBytes(item.url, 8 * 1024 * 1024)
            if (item.sticker) uploadSticker(guildId, item, bytes) else uploadEmoji(guildId, item, bytes)
            Utils.showToast(tr("Added {name} to {server}", "name" to item.label, "server" to guildName), true)
        } catch (e: Throwable) {
            logger.error("Failed to clone ${item.label}", e)
            Utils.showToast(tr("Couldn't clone {name}: {reason}", "name" to item.label, "reason" to Net.describe(e)), true)
        }
    }

    private fun uploadEmoji(guildId: Long, item: Expression, bytes: ByteArray) {
        val mime = if (item.url.contains(".gif")) "image/gif" else "image/png"
        // Emoji names must be 2 to 32 letters, digits or underscores
        val name = EMOJI_NAME_UNSAFE.matcher(item.name).replaceAll("_").let { if (it.length < 2) "${it}__" else it }.take(32)
        val body = JSONObject()
            .put("name", name)
            .put("image", "data:$mime;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP))
            .put("roles", JSONArray())
        Rest.call("/guilds/$guildId/emojis", "POST", body.toString())
    }

    private fun uploadSticker(guildId: Long, item: Expression, bytes: ByteArray) {
        val ext = if (item.url.contains(".gif")) "gif" else "png"
        val file = File(Utils.appContext.cacheDir, "sticker_${item.id}.$ext")
        try {
            file.writeBytes(bytes)
            val name = item.name.let { if (it.length < 2) "${it}__" else it }.take(30)
            val request = Http.Request.newDiscordRequest("/guilds/$guildId/stickers", "POST").setRequestTimeout(30_000)
            try {
                val form = LinkedHashMap<String, Any>()
                form["name"] = name
                // Tags are the words that suggest the sticker while typing, the name is a fine default
                form["tags"] = name
                form["description"] = ""
                form["file"] = file
                val res = request.executeWithMultipartForm(form, false)
                if (!res.ok()) {
                    val raw = try {
                        request.conn.errorStream?.use { IOUtils.readAsText(it) }
                    } catch (_: Throwable) {
                        null
                    }
                    val message = try {
                        raw?.let { JSONObject(it).optString("message") }?.ifEmpty { null }
                    } catch (_: Throwable) {
                        null
                    }
                    throw Net.HttpError(res.statusCode, message ?: raw?.take(200))
                }
            } finally {
                request.close()
            }
        } finally {
            file.delete()
        }
    }

    private companion object {
        const val DESCRIPTION = "Long-press a message to clone its custom emojis or stickers to one of your servers."
        const val ADMINISTRATOR = 1L shl 3
        const val MANAGE_EXPRESSIONS = 1L shl 30

        val CUSTOM_EMOJI: Pattern = Pattern.compile("<(a)?:(\\w{2,32}):(\\d{17,20})>")
        val EMOJI_NAME_UNSAFE: Pattern = Pattern.compile("[^A-Za-z0-9_]")
    }
}
