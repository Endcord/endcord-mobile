/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.jumpto

import android.content.Context
import com.aliucord.Http
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.endcord.plugins.api.ChannelSheetActions
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R
import org.json.JSONArray
import org.json.JSONObject

internal class JumpTo : EndcordPlugin(
    name = "JumpTo",
    description = "Adds context menu options to jump to the start or bottom of a channel/DM.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override fun start(context: Context) {
        ChannelSheetActions.register(name, "Jump To First Message", R.e.ic_arrow_up_24dp) { ctx ->
            val app = ctx.sheet.requireActivity()
            val channelId = ctx.channel.id
            fetchMessageId(app, "/channels/$channelId/messages?after=0&limit=1") { Common.openMessage(app, channelId, it) }
        }
        ChannelSheetActions.register(name, "Jump To Last Message", R.e.ic_arrow_down_24dp) { ctx ->
            val app = ctx.sheet.requireActivity()
            val channelId = ctx.channel.id
            fetchMessageId(app, "/channels/$channelId/messages?limit=1") { Common.openMessage(app, channelId, it) }
        }

        // Discord can only search servers, so these are not offered in direct messages, like on Endcord PC
        val inGuild: (MessageActions.Context) -> Boolean = { (it.model.channel?.guildId ?: 0L) != 0L && it.message.author != null }
        MessageActions.register(name, "Jump to their first message", R.e.ic_arrow_up_24dp, inGuild) { searchAuthor(it, true) }
        MessageActions.register(name, "Jump to their last message", R.e.ic_arrow_down_24dp, inGuild) { searchAuthor(it, false) }
    }

    override fun stop(context: Context) {
        ChannelSheetActions.unregisterAll(name)
        super.stop(context)
    }

    private fun searchAuthor(ctx: MessageActions.Context, first: Boolean) {
        val channel = ctx.model.channel ?: return
        val authorId = ctx.message.author?.id ?: return
        val app = ctx.sheet.requireActivity()
        val route = "/guilds/${channel.guildId}/messages/search?author_id=$authorId&channel_id=${channel.id}" +
            "&sort_by=timestamp&sort_order=${if (first) "asc" else "desc"}"

        Utils.threadPool.execute {
            try {
                val body = Http.Request.newDiscordRNRequest(route).use { req ->
                    req.execute().use { res ->
                        res.assertOk()
                        res.text()
                    }
                }
                // The index answers 202 with no results while it is still being built
                val groups = JSONObject(body).optJSONArray("messages")
                val id = groups?.optJSONArray(0)?.optJSONObject(0)?.optString("id")?.toLongOrNull()
                if (id == null) {
                    Utils.showToast(I18n.t("No messages found from this user in this channel."))
                    return@execute
                }
                Common.ui { Common.jumpInChat(channel.id, id) }
            } catch (e: Throwable) {
                logger.error("Message search failed", e)
                Utils.showToast(I18n.t("Failed to search for messages."))
            }
        }
    }

    /** Fetches the first message of a messages route and hands its id to [then] on the main thread. */
    private fun fetchMessageId(context: Context, route: String, then: (Long) -> Unit) {
        Utils.threadPool.execute {
            try {
                val body = Http.Request.newDiscordRNRequest(route).use { req ->
                    req.execute().use { res ->
                        res.assertOk()
                        res.text()
                    }
                }
                val id = JSONArray(body).optJSONObject(0)?.optString("id")?.toLongOrNull()
                if (id == null) {
                    Utils.showToast(I18n.t("This channel has no messages yet."))
                    return@execute
                }
                Common.ui { then(id) }
            } catch (e: Throwable) {
                logger.error("Failed to fetch $route", e)
                Utils.showToast(I18n.t("Couldn't load messages for this channel."))
            }
        }
    }
}
