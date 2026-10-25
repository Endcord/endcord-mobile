/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.nodmwhilestreaming

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.discord.api.channel.Channel
import com.discord.stores.StoreStream
import com.endcord.plugins.notifycommon.Msg
import com.endcord.plugins.notifycommon.NotifyHooks
import com.discord.api.message.Message as ApiMessage

internal class NoDMWhileStreaming : EndcordPlugin(
    name = "NoDMWhileStreaming",
    description = "Hides DM and Group DM notifications while you are sharing your screen",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("privacy", "notifications")

    override val settingsSchema = listOf(
        PluginSetting.Switch("hideGroups", "Group DMs", "Hide Group DMs too while streaming"),
    )

    private fun streaming(): Boolean = try {
        StoreStream.getApplicationStreaming().isScreenSharing
    } catch (_: Throwable) {
        false
    }

    private fun hidden(channel: Channel): Boolean =
        Msg.isDm(channel) || (bool("hideGroups") && Msg.isGroupDm(channel))

    override fun start(context: Context) {
        // Discord's in-app popup, drawn on top of the shared screen
        NotifyHooks.popups(name, listener = object : NotifyHooks.PopupListener {
            override fun allowPopup(message: ApiMessage, channel: Channel): Boolean = !(streaming() && hidden(channel))
        })
        // Push notifications pop up as heads-up notifications over the shared screen too
        NotifyHooks.pushes(name) { data ->
            if (data.guildId != 0L || !streaming()) return@pushes true
            val channel = Msg.channel(data.channelId) ?: return@pushes true
            !hidden(channel)
        }
    }

    override fun stop(context: Context) {
        NotifyHooks.unregisterAll(name)
        super.stop(context)
    }
}
