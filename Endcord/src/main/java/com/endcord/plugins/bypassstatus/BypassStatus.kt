/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.bypassstatus

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.aliucord.wrappers.ChannelWrapper.Companion.recipientIds
import com.discord.api.presence.ClientStatus
import com.endcord.plugins.api.ChannelSheetActions
import com.endcord.plugins.api.UserSheetActions
import com.endcord.plugins.notifycommon.IdList
import com.endcord.plugins.notifycommon.Msg
import com.endcord.plugins.notifycommon.Notifier
import com.endcord.plugins.notifycommon.NotifyHooks
import com.endcord.plugins.notifycommon.Sounds
import com.lytefast.flexinput.R
import com.discord.api.message.Message as ApiMessage

internal class BypassStatus : EndcordPlugin(
    name = "BypassStatus",
    description = "Still get notifications from specific sources when in do not disturb mode. Long-press users and channels to set them to bypass do not disturb mode.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("activity", "customisation", "notifications", "servers")

    override val settingsSchema = listOf(
        PluginSetting.Text("guilds", "Servers", "Guilds to let bypass (notified when pinged anywhere in guild)", placeholder = "Separate with commas", multiline = true),
        PluginSetting.Text("channels", "Channels", "Channels to let bypass (notified when pinged in that channel)", placeholder = "Separate with commas", multiline = true),
        PluginSetting.Text("users", "Users", "Users to let bypass (notified for all messages sent in DMs)", placeholder = "Separate with commas", multiline = true),
        PluginSetting.Switch(
            "allowOutsideOfDms",
            "Users outside of DMs",
            "Allow selected users to bypass status outside of DMs too (acts like a channel/guild bypass, but it's for all messages sent by the selected users)",
        ),
        PluginSetting.Switch("notificationSound", "Notification sound", "Whether the notification sound should be played", true),
        PluginSetting.Switch("respectSilentPings", "Respect silent pings", "Respect silent pings (@silent / suppress notifications)", true),
        PluginSetting.Choice(
            "statusToUse",
            "Status",
            "Status to use for whitelist",
            listOf(
                PluginSetting.Choice.Option("online", "Online"),
                PluginSetting.Choice.Option("idle", "Idle"),
                PluginSetting.Choice.Option("dnd", "Do Not Disturb"),
                PluginSetting.Choice.Option("invisible", "Invisible"),
            ),
            default = "dnd",
        ),
    )

    private val guilds by lazy { IdList(settings, "guilds") }
    private val channels by lazy { IdList(settings, "channels") }
    private val users by lazy { IdList(settings, "users") }

    override fun start(context: Context) {
        NotifyHooks.trackAppState(name)
        NotifyHooks.messages(name) { message ->
            if (shouldNotify(message)) {
                Notifier.message(name, message)
                if (bool("notificationSound") && !NotifyHooks.isBackgrounded) Sounds.playNotificationSound()
            }
        }

        UserSheetActions.register(name, "Add Status Bypass", R.e.ic_notification_24dp, visible = {
            it.user.id != Msg.me() && it.user.id !in users
        }) { users.toggle(it.user.id) }
        UserSheetActions.register(name, "Remove Status Bypass", R.e.ic_notifications_off_grey_24dp, visible = {
            it.user.id in users
        }) { users.toggle(it.user.id) }
        ChannelSheetActions.register(name, "Add Status Bypass", R.e.ic_notification_24dp, visible = {
            it.channel.id !in channels
        }) {
            channels.toggle(it.channel.id)
            Utils.showToast(I18n.t("Pings in this channel now bypass your status"))
        }
        ChannelSheetActions.register(name, "Remove Status Bypass", R.e.ic_notifications_off_grey_24dp, visible = {
            it.channel.id in channels
        }) { channels.toggle(it.channel.id) }
    }

    override fun stop(context: Context) {
        NotifyHooks.unregisterAll(name)
        super.stop(context)
    }

    private fun statusMatches(): Boolean {
        val status = Msg.myStatus() ?: return false
        return when (choice("statusToUse")) {
            "online" -> status == ClientStatus.ONLINE
            "idle" -> status == ClientStatus.IDLE
            "invisible" -> status == ClientStatus.INVISIBLE
            else -> status == ClientStatus.DND
        }
    }

    private fun shouldNotify(message: ApiMessage): Boolean {
        if (message.i().isNullOrEmpty() || Msg.isOwn(message) || !Msg.isFresh(message)) return false
        if (Msg.isViewing(message.g()) || !statusMatches()) return false
        if (bool("respectSilentPings") && ((message.l() ?: 0L) and SILENT_FLAG) != 0L) return false

        val channel = Msg.channel(message.g()) ?: return false
        val authorId = Msg.authorId(message)
        val mentioned = Msg.pingsMe(message, channel)
        val guildId = message.m() ?: 0L
        if ((guildId != 0L && guildId in guilds || message.g() in channels) && mentioned) return true
        if (authorId in users) {
            val theirDm = Msg.isDm(channel) && authorId in channel.recipientIds
            return theirDm || (mentioned && bool("allowOutsideOfDms"))
        }
        return false
    }

    private companion object {
        const val SILENT_FLAG = 1L shl 12
    }
}
