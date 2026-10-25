/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.autojumptomessage

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.discord.api.channel.Channel
import com.discord.utilities.channel.ChannelSelector
import com.endcord.plugins.notifycommon.Msg
import com.endcord.plugins.notifycommon.NotifyHooks
import com.discord.api.message.Message as ApiMessage

internal class AutoJumpToMessage : EndcordPlugin(
    name = "AutoJumpToMessage",
    description = "Automatically opens the channel from new messages you get notified about.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            "onlyWhenUnfocused",
            "Only in the background",
            "Only open the channel while Discord is in the background, so it's there when you come back",
            true,
        ),
    )

    override fun start(context: Context) {
        NotifyHooks.trackAppState(name)
        // Discord decides about its in-app notification for every new message, also in the background; that
        // decision already leaves out muted channels, Do Not Disturb and the channel that is open
        NotifyHooks.popups(name, priority = 1000, listener = object : NotifyHooks.PopupListener {
            override fun onPopup(message: ApiMessage, channel: Channel) {
                if (Msg.isOwn(message) || !Msg.isFresh(message)) return
                if (bool("onlyWhenUnfocused") && !NotifyHooks.isBackgrounded) return
                val channelId = message.g()
                Utils.mainThread.post {
                    try {
                        ChannelSelector.getInstance().findAndSet(Utils.appContext, channelId)
                    } catch (e: Throwable) {
                        logger.error("Failed to open the channel", e)
                    }
                }
            }
        })
    }

    override fun stop(context: Context) {
        NotifyHooks.unregisterAll(name)
        super.stop(context)
    }
}
