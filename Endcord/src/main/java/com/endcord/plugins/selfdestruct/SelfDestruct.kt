/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.selfdestruct

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.discord.models.message.Message
import com.discord.models.user.CoreUser
import com.discord.stores.StoreMessages
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.composercommon.ComposerUtils
import java.util.concurrent.ConcurrentHashMap
import com.discord.api.message.Message as ApiMessage

internal class SelfDestruct : ComposerPlugin(
    name = "SelfDestruct",
    description = "Sends messages that are automatically deleted after a configurable delay.",
    authors = arrayOf("vpg"),
) {
    override val tags = listOf("chat", "privacy")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            "active",
            "SelfDestruct active",
            "Also available from the long-press menu of the send button",
            default = false,
        ),
        PluginSetting.Number("delay", "Delay before deletion (seconds)", default = 30, min = 5, max = 600),
    )

    /** Pending deletions by message id. Like on Endcord PC they don't survive a restart. */
    private val timers = ConcurrentHashMap<Long, Runnable>()

    override fun start(context: Context) {
        composerAction("SelfDestruct", checked = { bool("active") }) {
            val active = !bool("active")
            settings.setBool("active", active)
            Utils.showToast(
                if (active) I18n.t("SelfDestruct on: messages are deleted after {seconds} seconds", "seconds" to delaySeconds())
                else I18n.t("SelfDestruct off"),
            )
        }

        // Every message that arrives from Discord, including the ones you send from other devices, like on PC
        patcher.after<StoreMessages>("handleMessageCreate", List::class.java) { param ->
            if (!bool("active")) return@after
            val messages = param.args[0] as? List<*> ?: return@after
            val me = ComposerUtils.myId()
            for (raw in messages) {
                val api = raw as? ApiMessage ?: continue
                // e() is the author, the only user of an api message; check it before converting the message
                val author = api.e() ?: continue
                if (CoreUser(author).id != me) continue
                val message = Message(api)
                if (message.id > 0) schedule(message.channelId, message.id)
            }
        }
    }

    override fun stop(context: Context) {
        for (task in timers.values) Utils.mainThread.removeCallbacks(task)
        timers.clear()
        super.stop(context)
    }

    private fun delaySeconds() = int("delay").coerceIn(5, 600)

    private fun schedule(channelId: Long, messageId: Long) {
        if (timers.containsKey(messageId)) return
        val task = Runnable {
            timers.remove(messageId)
            ComposerUtils.deleteMessage(channelId, messageId)
        }
        timers[messageId] = task
        Utils.mainThread.postDelayed(task, delaySeconds() * 1000L)
    }
}
