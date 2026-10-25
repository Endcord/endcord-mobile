/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.betterrolecontext

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.GuildRoleWrapper.Companion.color
import com.aliucord.wrappers.GuildRoleWrapper.Companion.icon
import com.aliucord.wrappers.GuildRoleWrapper.Companion.name
import com.discord.stores.StoreStream
import com.discord.utilities.permissions.PermissionUtils
import com.endcord.plugins.commandscommon.Dialogs
import com.endcord.plugins.userscommon.RoleChips
import com.endcord.plugins.userscommon.UserSheets
import com.endcord.plugins.userscommon.Users

internal class BetterRoleContext : EndcordPlugin(
    name = "BetterRoleContext",
    description = "Adds options to copy role color / edit role / view role icon when long-pressing roles in the user profile",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("roles", "appearance")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            key = "roleIconFileFormat",
            label = "File format to use when viewing role icons",
            options = listOf(
                PluginSetting.Choice.Option("png", "png"),
                PluginSetting.Choice.Option("webp", "webp"),
                PluginSetting.Choice.Option("jpg", "jpg"),
            ),
            default = "png",
        ),
    )

    override fun start(context: Context) {
        RoleChips.register(name, onLongClick = { chip -> showMenu(chip) })
    }

    override fun stop(context: Context) {
        RoleChips.unregisterAll(name)
        super.stop(context)
    }

    private fun showMenu(chip: RoleChips.Chip) {
        val activity = Users.activityOf(chip.view.context)
        val role = chip.role
        val labels = ArrayList<CharSequence>()
        val actions = ArrayList<() -> Unit>()

        val myPerms = StoreStream.getPermissions().guildPermissions[chip.guildId]
        if (PermissionUtils.can(MANAGE_ROLES, myPerms) && role.id != chip.guildId) {
            labels += I18n.t("Edit Role")
            actions += { UserSheets.editRole(chip.guildId, role.id, activity) }
        }
        if (role.color != 0) {
            val hex = String.format("#%06X", role.color and 0xFFFFFF)
            labels += "${I18n.t("Copy Role Color")} ($hex)"
            actions += { Dialogs.copy(hex) }
        }
        val icon = role.icon
        if (!icon.isNullOrEmpty()) {
            labels += I18n.t("View Role Icon")
            actions += {
                val format = choice("roleIconFileFormat")
                Utils.openMediaViewer("https://cdn.discordapp.com/role-icons/${role.id}/$icon.$format?size=512", "${role.name}.$format")
            }
        }
        labels += I18n.t("Copy Role ID")
        actions += { Dialogs.copy(role.id.toString()) }

        Dialogs.showList(activity, "@${role.name}", labels) { index -> actions[index]() }
    }

    private companion object {
        const val MANAGE_ROLES = 1L shl 28
    }
}
