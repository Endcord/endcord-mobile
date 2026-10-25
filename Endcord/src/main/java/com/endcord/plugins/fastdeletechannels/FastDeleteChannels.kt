/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.fastdeletechannels

import android.content.Context
import androidx.appcompat.app.AlertDialog
import com.aliucord.Utils
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.utils.RxUtils.await
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.discord.api.channel.Channel
import com.discord.api.channel.ChannelUtils
import com.discord.stores.StoreStream
import com.discord.utilities.permissions.PermissionUtils
import com.discord.utilities.rest.RestAPI
import com.endcord.plugins.api.ChannelSheetActions
import com.endcord.plugins.guildscommon.GuildsPlugin
import com.lytefast.flexinput.R

internal class FastDeleteChannels : GuildsPlugin(
    name = "FastDeleteChannels",
    description = "Adds a delete option to the channel long-press menu",
) {
    override val tags = listOf("servers", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch("confirm", "Ask before deleting", "Show a confirmation before the channel is deleted", default = true),
    )

    override fun start(context: Context) {
        ChannelSheetActions.register(name, "Delete Channel", R.e.ic_delete_24dp, { canDelete(it.channel) }) { ctx ->
            val channel = ctx.channel
            if (!bool("confirm")) {
                delete(channel)
                return@register
            }
            AlertDialog.Builder(Utils.appActivity)
                .setTitle(I18n.t("Delete Channel"))
                .setMessage(I18n.t("Delete #{channel}? This can't be undone.", "channel" to ChannelUtils.c(channel)))
                .setPositiveButton(I18n.t("Delete")) { _, _ -> delete(channel) }
                .setNegativeButton(I18n.t("Cancel"), null)
                .show()
        }
    }

    private fun canDelete(channel: Channel): Boolean {
        if (channel.guildId == 0L) return false
        val perms = StoreStream.getPermissions().permissionsByChannel[channel.id]
        return PermissionUtils.can(MANAGE_CHANNELS, perms)
    }

    private fun delete(channel: Channel) {
        val name = ChannelUtils.c(channel)
        Utils.threadPool.execute {
            val error = RestAPI.api.deleteChannel(channel.id).await().second
            if (error != null) logger.errorToast(I18n.t("Failed to delete #{channel}", "channel" to name), error)
            else Utils.showToast(I18n.t("Deleted #{channel}", "channel" to name))
        }
    }

    private companion object {
        const val MANAGE_CHANNELS = 1L shl 4
    }
}
