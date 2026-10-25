/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.silenceusers

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.endcord.plugins.api.UserSheetActions
import com.endcord.plugins.notifycommon.IdList
import com.endcord.plugins.notifycommon.Msg
import com.endcord.plugins.notifycommon.NotifyHooks
import com.discord.utilities.fcm.NotificationData as PushData
import com.lytefast.flexinput.R

internal class SilenceUsers : EndcordPlugin(
    name = "SilenceUsers",
    description = "Silences @mention pings and server badge counts from specific users. Regular messages and DMs are untouched.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("notifications")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            "mutedUserIds",
            "Silenced users",
            "Comma-separated Discord user IDs to silence pings and server badges.",
            multiline = true,
        ),
    )

    private val muted by lazy { IdList(settings, "mutedUserIds") }

    override fun start(context: Context) {
        // Runs after plugins that add pings (KeywordNotify), so a silenced user never pings
        NotifyHooks.incoming(name, priority = 100) { incoming ->
            val authorId = incoming.author?.id ?: return@incoming
            if (authorId in muted) Msg.clearMentions(incoming.target)
        }

        // Push notifications only reach plugins while Endcord runs. In a server channel that doesn't notify for
        // every message, a push from a silenced user can only be a ping: drop it
        NotifyHooks.pushes(name) { data ->
            if (data.type != PushData.TYPE_MESSAGE_CREATE || data.userId !in muted || data.guildId == 0L) return@pushes true
            val channel = Msg.channel(data.channelId) ?: return@pushes true
            Msg.notificationLevel(channel) == 0
        }

        UserSheetActions.register(name, "Silence pings", R.e.ic_notifications_off_grey_24dp, visible = {
            it.user.id != Msg.me() && it.user.id !in muted
        }) { ctx ->
            muted.toggle(ctx.user.id)
            Utils.showToast(I18n.t("Pings from this user are silenced"))
        }
        UserSheetActions.register(name, "Unsilence pings", R.e.ic_notification_24dp, visible = { it.user.id in muted }) { ctx ->
            muted.toggle(ctx.user.id)
            Utils.showToast(I18n.t("Pings from this user are back"))
        }
    }

    override fun stop(context: Context) {
        NotifyHooks.unregisterAll(name)
        super.stop(context)
    }
}
