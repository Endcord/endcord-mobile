/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.lastactive

import android.content.Context
import com.aliucord.Http
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.discord.stores.StoreStream
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.identitycommon.Members
import com.lytefast.flexinput.R
import org.json.JSONObject

/** Endcord PC's channel and user context menu entries, as entries of the message long-press sheet. */
internal class LastActive : EndcordPlugin(
    name = "LastActive",
    description = "A plugin to jump to last active message from yourself or another user in a channel/server.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override fun start(context: Context) {
        MessageActions.register(
            name,
            "User's Last Message",
            R.e.ic_history_white_24dp,
            visible = { it.message.author != null && it.message.author.id != Members.myId() },
        ) { ctx ->
            val author = ctx.message.author ?: return@register
            jumpToLastMessage(ctx.message.channelId, Members.guildId(ctx.message), author.id)
        }
        MessageActions.register(name, "Your Last Message", R.e.ic_history_white_24dp) { ctx ->
            jumpToLastMessage(ctx.message.channelId, Members.guildId(ctx.message), Members.myId())
        }
    }

    private fun jumpToLastMessage(channelId: Long, guildId: Long, userId: Long) {
        if (userId == 0L) return
        Utils.threadPool.execute {
            val messageId = try {
                findLastMessage(channelId, guildId, userId)
            } catch (e: Throwable) {
                logger.error("Error finding last message", e)
                Utils.showToast(I18n.t("Failed to find messages. Check console for details."))
                return@execute
            }
            if (messageId == null) {
                Utils.showToast(I18n.t("Couldn't find any recent messages from this user."))
                return@execute
            }
            Utils.mainThread.post {
                try {
                    StoreStream.getMessagesLoader().jumpToMessage(channelId, messageId)
                } catch (e: Throwable) {
                    logger.errorToast("Failed to jump to message. Check console for details.", e)
                }
            }
        }
    }

    /** Port of findLastMessageFromUser: Discord's search, newest first. Runs on a background thread. */
    private fun findLastMessage(channelId: Long, guildId: Long, userId: Long): Long? {
        val route = if (guildId == 0L) "/channels/$channelId/messages/search" else "/guilds/$guildId/messages/search"
        val query = Http.QueryBuilder(route)
            .append("author_id", userId.toString())
            .append("channel_id", channelId.toString())
            .append("sort_by", "timestamp")
            .append("sort_order", "desc")
            .append("offset", "0")
        val req = Http.Request.newDiscordRNRequest(query).setRequestTimeout(20_000)
        try {
            val res = req.execute()
            if (!res.ok()) throw IllegalStateException("Search failed with HTTP ${res.statusCode}")
            val groups = JSONObject(res.text()).optJSONArray("messages") ?: return null
            for (i in 0 until groups.length()) {
                val group = groups.optJSONArray(i) ?: continue
                for (j in 0 until group.length()) {
                    val msg = group.optJSONObject(j) ?: continue
                    val author = msg.optJSONObject("author")?.optString("id")?.toLongOrNull()
                    if (author == userId) return msg.optString("id").toLongOrNull()
                }
            }
            return null
        } finally {
            req.close()
        }
    }
}
