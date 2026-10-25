/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.uservoiceshow

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.endcord.plugins.api.UserSheetActions
import com.endcord.plugins.voicecommon.Voice
import com.lytefast.flexinput.R

internal class UserVoiceShow : EndcordPlugin(
    name = "UserVoiceShow",
    description = "Shows a Join Voice Channel entry in the profile of users who are in a voice channel",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("voice", "friends")

    override val settingsSchema = listOf(
        PluginSetting.Switch("showInDms", "Also show for DM and group calls", default = true),
    )

    /** The channel [userId] is in that you can see and aren't in yourself, or null. */
    private fun joinableChannel(userId: Long): Long? {
        if (userId == Voice.myId()) return null
        val channelId = Voice.channelOf(userId) ?: return null
        if (channelId == Voice.myChannelId()) return null
        val channel = Voice.channel(channelId) ?: return null
        if (channel.guildId == 0L) return if (bool("showInDms")) channelId else null
        return if (Voice.can(channel, Voice.PERM_VIEW_CHANNEL)) channelId else null
    }

    override fun start(context: Context) {
        UserSheetActions.register(
            name,
            "Join Voice Channel",
            R.e.ic_channel_voice,
            visible = { joinableChannel(it.user.id) != null },
        ) { ctx ->
            val channelId = joinableChannel(ctx.user.id) ?: return@register
            Utils.showToast(I18n.t("Joining {channel}", "channel" to Voice.channelName(channelId)))
            Voice.join(channelId) { result -> Voice.joinFailure(result)?.let { Utils.showToast(it) } }
        }
    }
}
