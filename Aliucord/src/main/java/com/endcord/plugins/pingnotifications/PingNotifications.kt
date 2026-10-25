/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.pingnotifications

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.recipientIds
import com.discord.api.channel.Channel
import com.discord.api.presence.ClientStatus
import com.endcord.plugins.notifycommon.Msg
import com.endcord.plugins.notifycommon.Notifier
import com.endcord.plugins.notifycommon.NotifyHooks
import com.endcord.plugins.notifycommon.OwnPopups
import com.discord.api.message.Message as ApiMessage

internal class PingNotifications : EndcordPlugin(
    name = "PingNotifications",
    description = "Customizable notifications with improved mention formatting",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "friends", "notifications", "servers")

    override val settingsSchema = listOf(
        PluginSetting.Switch("friends", "Friends in servers", "Notify when friends send messages in servers"),
        PluginSetting.Switch("mentions", "Mentions", "Notify when someone @mentions you directly", true),
        PluginSetting.Switch("dms", "Direct messages", "Notify for direct messages (DMs)", true),
        PluginSetting.Switch("showInActive", "Current channel", "Show notifications even for currently active channel"),
        PluginSetting.Switch("ignoreMuted", "Skip muted", "Skip notifications from muted servers, channels, or users", true),
    )

    private val popups = OwnPopups(name, ::shouldNotify, ::show)

    override fun start(context: Context) = popups.start()

    override fun stop(context: Context) {
        NotifyHooks.unregisterAll(name)
        super.stop(context)
    }

    private fun shouldNotify(message: ApiMessage): Boolean {
        val channel = Msg.channel(message.g()) ?: return false
        val authorId = Msg.authorId(message)
        if (authorId == 0L) return false
        val isDm = Msg.isPrivate(channel)

        if (bool("ignoreMuted") && (isMuted(channel, isDm) || Msg.isBlocked(authorId))) return false
        if (!bool("showInActive") && Msg.isViewing(message.g())) return false
        if (Msg.myStatus() == ClientStatus.DND) return false

        // In the background Discord's own push notification already covers DMs and mentions
        val background = NotifyHooks.isBackgrounded
        return when {
            bool("mentions") && Msg.mentionsMe(message) -> !background
            bool("friends") && Msg.isFriend(authorId) && !isDm -> true
            isDm && bool("dms") -> !background
            else -> false
        }
    }

    private fun isMuted(channel: Channel, isDm: Boolean): Boolean {
        if (Msg.isMuted(channel)) return true
        return isDm && channel.recipientIds.any { Msg.isBlocked(it) }
    }

    private fun show(message: ApiMessage) {
        val channel = Msg.channel(message.g()) ?: return
        val author = Msg.nameOf(Msg.authorId(message), message.m() ?: 0L, message.e())
        val where = Msg.rawName(channel).ifEmpty { if (Msg.isGroupDm(channel)) I18n.t("Group") else I18n.t("DM") }
        Notifier.message(name, message, title = I18n.t("{user} in {channel}", "user" to author, "channel" to where))
    }
}
