/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.silentdelete

import android.content.Context
import com.aliucord.Utils
import com.aliucord.api.CommandsAPI
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.tr
import com.discord.api.commands.ApplicationCommandType
import com.discord.stores.StoreStream
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.translatecommon.Rest
import com.lytefast.flexinput.R
import org.json.JSONArray
import org.json.JSONObject

internal class SilentDelete : EndcordPlugin(
    name = "SilentDelete",
    description = "\"Silently\" deletes a message. Bypass message loggers by replacing the message with a placeholder.",
    authors = arrayOf("vpg"),
) {
    override val tags = listOf("chat", "privacy")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            key = "replacementText",
            label = "Replacement Text",
            description = "Text to replace the message with before deletion.",
            default = "** **",
        ),
        PluginSetting.Number(
            key = "deleteDelay",
            label = "Delete Delay",
            description = "Delay in milliseconds before deleting the replacement message (recommended: 100-500).",
            default = 200,
            min = 0,
            max = 10_000,
        ),
        PluginSetting.Switch(
            key = "suppressNotifications",
            label = "Suppress Notifications",
            description = "Suppress notifications when replacing the message (prevents pinging mentioned users).",
            default = true,
        ),
        PluginSetting.Switch(
            key = "deleteOriginal",
            label = "Delete Original",
            description = "Delete the original message from server. If disabled, the original message will reappear on client restart.",
            default = true,
        ),
        PluginSetting.Number(
            key = "purgeInterval",
            label = "Purge Interval",
            description = "Delay in milliseconds between each message deletion during /silentpurge (recommended: 500-1000 to avoid rate limits).",
            default = 500,
            min = 250,
            max = 10_000,
        ),
    )

    @Volatile
    private var purging = false

    override fun start(context: Context) {
        MessageActions.register(
            name,
            "Silent Delete",
            R.e.ic_delete_24dp,
            visible = { it.message.author?.id == StoreStream.getUsers().me.id && !it.message.isLocal },
        ) {
            val message = it.message
            Utils.threadPool.execute {
                val ok = silentDelete(message.channelId, message.id)
                Utils.showToast(if (ok) tr("Message silently deleted") else tr("Failed to silently delete the message"))
            }
        }

        commands.registerCommand(
            "silentpurge",
            "Silently delete your recent messages in this channel",
            listOf(
                Utils.createCommandOption(
                    type = ApplicationCommandType.INTEGER,
                    name = "count",
                    description = "Number of your messages to silently delete (1-100)",
                    required = true,
                    minValue = 1,
                    maxValue = 100,
                ),
            ),
        ) { ctx ->
            val count = ctx.getRequiredLong("count").toInt()
            if (count !in 1..100) {
                return@registerCommand CommandsAPI.CommandResult(tr("Choose a number from 1 to 100"), null, false)
            }
            if (purging) {
                return@registerCommand CommandsAPI.CommandResult(tr("A purge is already running"), null, false)
            }
            val channelId = ctx.channelId
            purging = true
            Utils.threadPool.execute {
                try {
                    val deleted = purge(channelId, count)
                    Utils.showToast(tr("Successfully silently deleted {count} message(s).", "count" to deleted), true)
                } finally {
                    purging = false
                }
            }
            CommandsAPI.CommandResult(tr("Deleting your last {count} messages…", "count" to count), null, false)
        }
    }

    override fun stop(context: Context) {
        purging = false
        super.stop(context)
    }

    /**
     * Endcord PC's sequence: send a placeholder carrying the original's id as nonce, delete it, then delete the
     * original. Every call goes through [Rest], which waits out rate limits, so a purge never leaves placeholders.
     */
    private fun silentDelete(channelId: Long, messageId: Long, deleteOriginal: Boolean = bool("deleteOriginal")): Boolean = try {
        val body = JSONObject()
            .put("content", string("replacementText").ifEmpty { "** **" })
            .put("flags", if (bool("suppressNotifications")) SUPPRESS_NOTIFICATIONS else 0)
            .put("nonce", messageId.toString())
            .put("tts", false)
            .toString()
        val placeholderId = JSONObject(Rest.call("/channels/$channelId/messages", "POST", body)).getString("id")

        Thread.sleep(int("deleteDelay").toLong())
        Rest.call("/channels/$channelId/messages/$placeholderId", "DELETE")

        if (deleteOriginal) {
            Thread.sleep(100)
            Rest.call("/channels/$channelId/messages/$messageId", "DELETE")
        }
        true
    } catch (e: Throwable) {
        logger.error("Silent delete failed", e)
        false
    }

    /** Silently deletes up to [count] of your newest messages in a channel. Runs in the background. */
    private fun purge(channelId: Long, count: Int): Int {
        val me = StoreStream.getUsers().me.id.toString()
        val ids = ArrayList<Long>()
        var before: String? = null
        try {
            while (ids.size < count && purging) {
                val route = "/channels/$channelId/messages?limit=100" + (before?.let { "&before=$it" } ?: "")
                val page = JSONArray(Rest.call(route))
                if (page.length() == 0) break
                for (i in 0 until page.length()) {
                    val message = page.getJSONObject(i)
                    if (message.optJSONObject("author")?.optString("id") == me) {
                        ids += message.getString("id").toLong()
                        if (ids.size >= count) break
                    }
                }
                before = page.getJSONObject(page.length() - 1).getString("id")
                if (page.length() < 100) break
                Thread.sleep(100)
            }
        } catch (e: Throwable) {
            logger.error("Failed to load messages for /silentpurge", e)
        }

        var deleted = 0
        val interval = int("purgeInterval").toLong()
        for ((i, id) in ids.withIndex()) {
            if (!purging) break
            if (silentDelete(channelId, id, true)) deleted++
            if (i < ids.size - 1) Thread.sleep(interval)
        }
        return deleted
    }

    private companion object {
        /** Discord's SUPPRESS_NOTIFICATIONS message flag. */
        const val SUPPRESS_NOTIFICATIONS = 1 shl 12
    }
}
