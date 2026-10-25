/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagenotifier

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.endcord.plugins.api.UserSheetActions
import com.endcord.plugins.notifycommon.IdList
import com.endcord.plugins.notifycommon.Msg
import com.endcord.plugins.notifycommon.Notifier
import com.endcord.plugins.notifycommon.NotifyHooks
import com.lytefast.flexinput.R

internal class MessageNotifier : EndcordPlugin(
    name = "MessageNotifier",
    description = "Get toasts for when chosen users send a message",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "notifications")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            key = "users",
            label = "Users",
            description = "Comma separated list of user ids to get message toasts for",
            placeholder = "000000000000000000, 111111111111111111",
            multiline = true,
        ),
    )

    private val users by lazy { IdList(settings, "users") }

    override fun start(context: Context) {
        NotifyHooks.trackAppState(name)
        NotifyHooks.messages(name) { message ->
            val authorId = Msg.authorId(message)
            if (authorId !in users || Msg.isOwn(message)) return@messages
            if (!Msg.isRegular(message) || !Msg.isFresh(message) || Msg.isViewing(message.g())) return@messages

            val author = Msg.nameOf(authorId, message.m() ?: 0L, message.e())
            val channel = Msg.channel(message.g())
            val place = channel?.let { Msg.placeOf(it) }.orEmpty().ifEmpty { I18n.t("their DMs") }
            Notifier.show(
                key = "$name:${message.g()}",
                title = I18n.t("{user} sent a message", "user" to author),
                body = I18n.t("Tap to jump to {place}", "place" to place),
                iconUrl = Msg.avatarOf(authorId),
                target = Notifier.Target(message.g(), message.o()),
            )
        }

        UserSheetActions.register(name, "Notify me about their messages", R.e.ic_notification_24dp, visible = {
            it.user.id != Msg.me() && it.user.id !in users
        }) { ctx ->
            users.toggle(ctx.user.id)
            Utils.showToast(I18n.t("You'll get a notification when they send a message"))
        }
        UserSheetActions.register(name, "Stop message notifications", R.e.ic_notifications_off_grey_24dp, visible = {
            it.user.id in users
        }) { ctx ->
            users.toggle(ctx.user.id)
            Utils.showToast(I18n.t("Message notifications for this user are off"))
        }
    }

    override fun stop(context: Context) {
        NotifyHooks.unregisterAll(name)
        super.stop(context)
    }
}
