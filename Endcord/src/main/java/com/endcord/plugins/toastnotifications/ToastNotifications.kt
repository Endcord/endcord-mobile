/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.toastnotifications

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.discord.api.presence.ClientStatus
import com.endcord.plugins.notifycommon.IdList
import com.endcord.plugins.notifycommon.Msg
import com.endcord.plugins.notifycommon.Notifier
import com.endcord.plugins.notifycommon.NotifyHooks
import com.endcord.plugins.notifycommon.OwnPopups
import com.discord.api.message.Message as ApiMessage

internal class ToastNotifications : EndcordPlugin(
    name = "ToastNotifications",
    description = "Show a pop-up toast notification, configurable for DMs, group, friends, or guild channels.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "customisation", "notifications")

    override val settingsSchema = listOf(
        PluginSetting.Number("timeout", "Duration", "Time in seconds notifications will be shown for.", 5, 1, 15),
        PluginSetting.Switch("respectDoNotDisturb", "Respect Do Not Disturb", "Do not show notifications when your status is Do Not Disturb."),
        PluginSetting.Switch("directMessages", "Direct messages", "Show notifications for direct messages.", true),
        PluginSetting.Switch("groupMessages", "Group messages", "Show notifications for group messages.", true),
        PluginSetting.Switch(
            "friendServerNotifications",
            "Friends in servers",
            "Show notifications when friends send messages in servers they share with you.",
            true,
        ),
        PluginSetting.Text(
            "ignoreUsers",
            "Ignored users",
            "A list of user IDs (separate by commas) to ignore displaying notifications for.",
            placeholder = "000000000000000000,111111111111111111,222222222222222222",
            multiline = true,
        ),
        PluginSetting.Text(
            "notifyFor",
            "Always notify for",
            "A list of channel IDs (separate by commas) to always receive notifications from.",
            placeholder = "000000000000000000,111111111111111111,222222222222222222",
            multiline = true,
        ),
        PluginSetting.Action("exampleButton", "Show Example Notification", "Show an example toast notification.") {
            val me = Msg.me()
            Notifier.show(
                key = "$name:example",
                title = I18n.t("Example Notification"),
                body = I18n.t("This is an example toast notification!"),
                iconUrl = Msg.avatarOf(me),
                seconds = int("timeout"),
            )
        },
    )

    private val ignored by lazy { IdList(settings, "ignoreUsers") }
    private val notifyFor by lazy { IdList(settings, "notifyFor") }
    private val popups = OwnPopups(name, ::shouldNotify) { Notifier.message(name, it, seconds = int("timeout")) }

    override fun start(context: Context) = popups.start()

    override fun stop(context: Context) {
        NotifyHooks.unregisterAll(name)
        super.stop(context)
    }

    private fun shouldNotify(message: ApiMessage): Boolean {
        // Toasts are shown inside the app only
        if (NotifyHooks.isBackgrounded) return false
        val channel = Msg.channel(message.g()) ?: return false
        val authorId = Msg.authorId(message)
        if (Msg.isViewing(message.g()) || authorId in ignored) return false
        if (bool("respectDoNotDisturb") && Msg.myStatus() == ClientStatus.DND) return false

        if (!Msg.isPrivate(channel)) return shouldNotifyInServer(message, channel, authorId)
        if (!bool("directMessages") && Msg.isDm(channel)) return false
        if (!bool("groupMessages") && Msg.isGroupDm(channel)) return false
        return !Msg.isMuted(channel)
    }

    private fun shouldNotifyInServer(message: ApiMessage, channel: com.discord.api.channel.Channel, authorId: Long): Boolean {
        // The allowlist always wins
        if (message.g() in notifyFor) return true
        if (bool("friendServerNotifications") && Msg.isFriend(authorId)) return true
        if (Msg.isMuted(channel)) return false
        return when (Msg.notificationLevel(channel)) {
            0 -> true
            1 -> message.i().orEmpty().let { it.contains("<@${Msg.me()}>") || it.contains("<@!${Msg.me()}>") }
            else -> false
        }
    }
}
