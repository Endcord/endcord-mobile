/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.invitedefaults

import android.content.Context
import android.widget.RadioGroup
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.after
import com.aliucord.patcher.before
import com.discord.models.domain.ModelInvite
import com.discord.stores.StoreInviteSettings
import com.discord.stores.StoreStream
import com.discord.widgets.guilds.invite.ViewInviteSettingsSheet
import com.discord.widgets.guilds.invite.WidgetGuildInviteSettings
import com.endcord.plugins.guildsbcommon.GuildsBPlugin
import kotlin.jvm.functions.Function1

/**
 * The legacy app resets the invite settings to its defaults (1 day, no use limit, not temporary) every time you
 * open a server (`StoreInviteSettings.handleGuildSelected` -> `getInviteSettings(guildId)`); that default is
 * replaced with the configured one. The invite sheets only offer 1, 10 and 100 uses, so 5, 25 and 50 are added
 * to their use count buttons, as on Endcord PC.
 */
internal class InviteDefaults : GuildsBPlugin(
    name = "InviteDefaults",
    description = "Allows you to edit the default values when creating server invites.",
) {
    override val tags = listOf("servers")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            "inviteDuration", "Invite Duration",
            options = listOf(
                PluginSetting.Choice.Option("1800", "30 minutes"),
                PluginSetting.Choice.Option("3600", "1 hour"),
                PluginSetting.Choice.Option("21600", "6 hours"),
                PluginSetting.Choice.Option("43200", "12 hours"),
                PluginSetting.Choice.Option("86400", "1 day"),
                PluginSetting.Choice.Option("604800", "7 days"),
                PluginSetting.Choice.Option("0", "Forever"),
            ),
            default = "0",
        ),
        PluginSetting.Choice(
            "maxUses", "Invite Use Count",
            options = listOf(
                PluginSetting.Choice.Option("0", "Infinite"),
                PluginSetting.Choice.Option("1", "1"),
                PluginSetting.Choice.Option("5", "5"),
                PluginSetting.Choice.Option("10", "10"),
                PluginSetting.Choice.Option("25", "25"),
                PluginSetting.Choice.Option("50", "50"),
                PluginSetting.Choice.Option("100", "100"),
            ),
            default = "0",
        ),
        PluginSetting.Switch("temporaryMembership", "Temporary Membership"),
    )

    private fun defaults() = ModelInvite.Settings(
        choice("inviteDuration").toIntOrNull() ?: 0,
        choice("maxUses").toIntOrNull() ?: 0,
        bool("temporaryMembership"),
    )

    override fun start(context: Context) {
        patcher.after<StoreInviteSettings>("getInviteSettings", Long::class.javaPrimitiveType!!) { param ->
            try {
                param.result = defaults()
            } catch (e: Throwable) {
                logger.error("Failed to apply the invite defaults", e)
            }
        }

        val buttonTypes = arrayOf(RadioGroup::class.java, IntArray::class.java, Function1::class.java)
        patcher.before<ViewInviteSettingsSheet>("createHorizontalCheckableButtons", *buttonTypes) { param -> extendUses(param.args) }
        patcher.before<WidgetGuildInviteSettings>("createHorizontalCheckableButtons", *buttonTypes) { param -> extendUses(param.args) }

        applyNow()
    }

    override fun onSettingChanged(key: String) = applyNow()

    /** The invite settings of the session are only reset when a server is opened; apply the defaults right away. */
    private fun applyNow() {
        try {
            StoreStream.getInviteSettings().setInviteSettings(defaults())
        } catch (e: Throwable) {
            logger.error("Failed to apply the invite defaults", e)
        }
    }

    private fun extendUses(args: Array<Any?>) {
        if (args[1] === ModelInvite.Settings.MAX_USES_ARRAY) args[1] = USES
    }

    override fun stop(context: Context) {
        super.stop(context)
        try {
            val store = StoreStream.getInviteSettings()
            store.setInviteSettings(store.getInviteSettings(StoreStream.getGuildSelected().selectedGuildId))
        } catch (e: Throwable) {
            logger.error("Failed to restore the invite settings", e)
        }
    }

    private companion object {
        val USES = intArrayOf(0, 1, 5, 10, 25, 50, 100)
    }
}
