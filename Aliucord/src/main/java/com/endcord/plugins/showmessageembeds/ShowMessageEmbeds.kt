/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.showmessageembeds

import android.content.Context
import android.net.Uri
import com.aliucord.Http
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.aliucord.utils.GsonUtils
import com.aliucord.utils.GsonUtils.fromJson
import com.aliucord.wrappers.embeds.MessageEmbedWrapper.Companion.url
import com.aliucord.wrappers.messages.AttachmentWrapper.Companion.url
import com.discord.api.message.embed.MessageEmbed
import com.discord.models.message.Message
import com.discord.stores.StoreStream
import com.discord.utilities.channel.ChannelSelector
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.actionscommon.MessageParts
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R
import java.lang.reflect.Field
import com.discord.api.message.Message as ApiMessage

internal class ShowMessageEmbeds : EndcordPlugin(
    name = "ShowMessageEmbeds",
    description = "Adds a context menu option to show embeds for links that don't have one",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "chat")

    /** Shape of the unfurler's answer. */
    private class UnfurlResponse(val embeds: List<MessageEmbed>? = null)

    override fun start(context: Context) {
        MessageActions.register(
            name,
            "Show Embed",
            R.e.ic_embed_white_24dp,
            visible = { linksWithoutEmbed(it.message).isNotEmpty() },
        ) { ctx ->
            val links = linksWithoutEmbed(ctx.message)
            val message = ctx.message
            if (links.size == 1) unfurl(message.channelId, message.id, links[0])
            else Common.pick(ctx.sheet.parentFragmentManager, I18n.t("Show Embed"), links) { unfurl(message.channelId, message.id, links[it]) }
        }
        MessageActions.register(
            name,
            "Remove Embed",
            R.e.ic_close_white_24dp,
            visible = { removableEmbeds(it.message).isNotEmpty() },
        ) { ctx ->
            val urls = removableEmbeds(ctx.message)
            val message = ctx.message
            if (urls.size == 1) removeEmbed(message.channelId, message.id, urls[0])
            else Common.pick(ctx.sheet.parentFragmentManager, I18n.t("Remove Embed"), urls) { removeEmbed(message.channelId, message.id, urls[it]) }
        }
    }

    /** Links in the text that have no embed yet, normalised the way Discord reports them back. */
    private fun linksWithoutEmbed(message: Message): List<String> {
        val links = links(message)
        if (links.isEmpty()) return emptyList()
        val embedded = HashSet<String>()
        message.embeds.orEmpty().forEach { embed -> embed.url?.let { embedded.add(normalise(it)) } }
        MessageParts.attachments(message).forEach { embedded.add(it.url) }
        return links.filter { it !in embedded }
    }

    /** Embeds whose link is in the text, so they can be brought back by showing them again. */
    private fun removableEmbeds(message: Message): List<String> {
        val links = links(message).toHashSet()
        if (links.isEmpty()) return emptyList()
        return message.embeds.orEmpty().mapNotNull { it.url }.filter { normalise(it) in links }.distinct()
    }

    private fun links(message: Message): List<String> {
        val content = message.content
        if (content.isNullOrEmpty() || !content.contains("http")) return emptyList()
        return linkRegex.findAll(content, 0)
            .map { normalise(it.value.trimEnd('>', ')', ']', '.', ',', '!', '?', '"', '\'')) }
            .filter { Uri.parse(it).host != null }
            .distinct()
            .toList()
    }

    private fun unfurl(channelId: Long, messageId: Long, url: String) {
        Utils.threadPool.execute {
            try {
                val response = Http.Request.newDiscordRNRequest("/unfurler/embed-urls", "POST").use { req ->
                    req.executeWithJson(mapOf("urls" to listOf(url))).use { res ->
                        res.assertOk()
                        GsonUtils.gsonRestApi.fromJson(res.text(), UnfurlResponse::class.java)
                    }
                }
                val found = response.embeds.orEmpty()
                if (found.isEmpty()) {
                    Utils.showToast(I18n.t("No embeds found"))
                    return@execute
                }
                Common.ui {
                    update(channelId, messageId) { message, embeds ->
                        val content = message.content.orEmpty()
                        // Keep the embeds in the order their links appear in the text, like Endcord PC
                        (embeds + found).sortedBy { embed -> embed.url?.let { content.indexOf(it) } ?: Int.MAX_VALUE }
                    }
                }
            } catch (e: Throwable) {
                logger.error("Failed to get embed", e)
                Utils.showToast(I18n.t("Failed to get embed"))
            }
        }
    }

    private fun removeEmbed(channelId: Long, messageId: Long, url: String) {
        update(channelId, messageId) { _, embeds -> embeds.filter { it.url != url } }
    }

    /**
     * Changes the embeds of a cached message on this device only, through the same path a message update
     * from Discord takes. The next real update of the message puts Discord's embeds back.
     */
    private fun update(channelId: Long, messageId: Long, change: (Message, List<MessageEmbed>) -> List<MessageEmbed>) {
        val message = StoreStream.getMessages().getMessage(channelId, messageId) ?: return
        val api = message.synthesizeApiMessage()
        embedsField.set(api, change(message, message.embeds.orEmpty()))
        ChannelSelector.getInstance().dispatcher.schedule {
            StoreStream.getMessages().handleMessageUpdate(api)
        }
    }

    /** The special cases from Endcord PC where Discord answers with a different link than the one asked for. */
    private fun normalise(url: String): String {
        var out = url
        youtube.find(out, 0)?.let { match ->
            val uri = Uri.parse(out)
            val start = (uri.getQueryParameter("start") ?: uri.getQueryParameter("t"))?.let { seconds(it) } ?: 0
            out = "https://www.youtube.com/watch?v=${match.groupValues[4]}" + if (start > 0) "&start=$start" else ""
        }
        out = out.replace(xDotCom) { "${it.groupValues[1]}twitter.com${it.groupValues[2]}" }
        if (tiktok.containsMatchIn(out) && !out.contains("enable_tiktok_webview")) {
            out += (if (out.contains('?')) "&" else "?") + "enable_tiktok_webview=true"
        }
        return out
    }

    /** `1h2m3s`, `90s` or `90` as seconds. */
    private fun seconds(value: String): Int {
        if (value.all { it.isDigit() }) return value.toIntOrNull() ?: 0
        var total = 0
        Regex("(\\d+)([hms])").findAll(value, 0).forEach {
            val n = it.groupValues[1].toIntOrNull() ?: 0
            total += when (it.groupValues[2]) {
                "h" -> n * 3600
                "m" -> n * 60
                else -> n
            }
        }
        return total
    }

    private companion object {
        val linkRegex = Regex("https?://[^\\s<>]+")
        val youtube = Regex("(https?://)?(?:m\\.|www\\.)?(youtu\\.be|youtube\\.com)/(embed/|v/|watch\\?v=|watch\\?.+&v=|shorts/)?((\\w|-){11})")
        val xDotCom = Regex("(https?://(?:www\\.)?)x\\.com(/.*)?")
        val tiktok = Regex("https?://(?:www\\.)?tiktok\\.com(/.*)?")

        val embedsField: Field by lazy {
            ApiMessage::class.java.getDeclaredField("embeds").apply { isAccessible = true }
        }
    }
}
