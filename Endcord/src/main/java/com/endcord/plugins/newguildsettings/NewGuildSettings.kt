/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.newguildsettings

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.patcher.before
import com.aliucord.utils.RxUtils.await
import com.aliucord.wrappers.GuildWrapper.Companion.id
import com.aliucord.wrappers.GuildWrapper.Companion.joinedAt
import com.discord.restapi.RestAPIParams
import com.discord.stores.StoreGuilds
import com.discord.stores.StoreStream
import com.discord.utilities.rest.RestAPI
import com.discord.utilities.time.TimeUtils
import com.endcord.plugins.guildscommon.GuildMenuActions
import com.endcord.plugins.guildscommon.GuildsPlugin
import com.lytefast.flexinput.R
import com.discord.api.guild.Guild as ApiGuild

internal class NewGuildSettings : GuildsPlugin(
    name = "NewGuildSettings",
    description = "Automatically mute new servers and change various other settings upon joining",
) {
    override val tags = listOf("servers", "notifications")

    override val settingsSchema = listOf(
        PluginSetting.Switch("guild", "Mute Guild automatically", default = true),
        PluginSetting.Choice(
            key = "messages",
            label = "Server Notification Settings",
            options = listOf(
                PluginSetting.Choice.Option("0", "All messages"),
                PluginSetting.Choice.Option("1", "Only @mentions"),
                PluginSetting.Choice.Option("2", "Nothing"),
                PluginSetting.Choice.Option("3", "Server default"),
            ),
            default = "3",
        ),
        PluginSetting.Switch("everyone", "Suppress @everyone and @here", default = true),
        PluginSetting.Switch("role", "Suppress All Role @mentions", default = true),
        PluginSetting.Switch("highlights", "Suppress Highlights automatically", default = true),
    )

    override fun start(context: Context) {
        patcher.before<StoreGuilds>("handleGuildAdd", ApiGuild::class.java) { param ->
            val guild = param.args[0] as? ApiGuild ?: return@before
            try {
                if (guilds.containsKey(guild.id)) return@before
                // GUILD_CREATE also arrives when a server comes back after an outage: only act on fresh joins
                val joined = guild.joinedAt?.let { TimeUtils.parseUTCDate(it) } ?: return@before
                if (System.currentTimeMillis() - joined > JOIN_WINDOW_MS) return@before
                apply(guild.id, null)
            } catch (e: Throwable) {
                logger.error("Failed to check a new server", e)
            }
        }

        GuildMenuActions.register(name, { "Apply NewGuildSettings" }, R.e.ic_settings_24dp) { ctx ->
            apply(ctx.guild.id, ctx.guild.name)
        }
    }

    /** Sends the configured notification settings for [guildId]; [name] is shown in a toast when given. */
    private fun apply(guildId: Long, name: String?) {
        val messages = choice("messages").toIntOrNull()?.takeIf { it >= 0 && it <= 2 }
        val settings = RestAPIParams.UserGuildSettings(
            bool("everyone"),
            bool("role"),
            bool("guild"),
            null,
            null,
            messages,
            null,
            if (bool("highlights")) 1 else 0,
        )
        Utils.threadPool.execute {
            val error = RestAPI.api.updateUserGuildSettings(guildId, settings).await().second
            if (error != null) {
                logger.errorToast(I18n.t("Failed to apply server settings"), error)
            } else if (name != null) {
                Utils.showToast(I18n.t("Applied NewGuildSettings to {server}", "server" to name))
            }
        }
    }

    private companion object {
        const val JOIN_WINDOW_MS = 10 * 60 * 1000L
    }
}
