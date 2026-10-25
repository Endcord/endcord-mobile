/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.ignoreactivities

import android.content.Context
import com.aliucord.PluginManager
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.entities.PluginSetting.Choice.Option
import com.aliucord.i18n.I18n
import com.discord.api.activity.Activity
import com.discord.api.activity.ActivityType
import com.endcord.plugins.presencecommon.PresenceHub

internal class IgnoreActivities : EndcordPlugin(
    name = "IgnoreActivities",
    description = "Ignore activities from showing up on your status ONLY. Choose which kinds of activities, or which application IDs, are kept off your status.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("activity", "privacy", "customisation")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            "listMode", "Change the mode of the filter list", null,
            listOf(Option("whitelist", "Whitelist"), Option("blacklist", "Blacklist")),
        ),
        PluginSetting.Text(
            "idsList", "Filter List",
            "Comma separated list of activity IDs to filter (Useful for filtering specific RPC activities and CustomRPC",
            placeholder = "235834946571337729, 343383572805058560", multiline = true,
        ),
        PluginSetting.Action(
            "importCustomRPC", "Import CustomRPC ID",
            "Import the application id of the CustomRPC plugin to the filter list",
        ) { importCustomRpc() },
        PluginSetting.Switch("ignorePlaying", "Ignore all playing activities (These are usually game and RPC activities)"),
        PluginSetting.Switch("ignoreStreaming", "Ignore all streaming activities"),
        PluginSetting.Switch("ignoreListening", "Ignore all listening activities (These are usually spotify activities)"),
        PluginSetting.Switch("ignoreWatching", "Ignore all watching activities"),
        PluginSetting.Switch("ignoreCompeting", "Ignore all competing activities (These are normally special game activities)"),
    )

    override fun start(context: Context) {
        PresenceHub.setFilter(name) { !isIgnored(it) }
    }

    override fun stop(context: Context) {
        PresenceHub.unregisterAll(name)
        super.stop(context)
    }

    /** The filter reads the settings on every update; this only resends the presence with them applied. */
    override fun onSettingChanged(key: String) = PresenceHub.refresh()

    private fun ids(): Set<String> = list("idsList").toSet()

    private fun isIgnored(activity: Activity): Boolean {
        val id = activity.a()?.toString()
        if (id != null && id in ids()) return choice("listMode") == "blacklist"
        return when (activity.p()) {
            ActivityType.PLAYING -> bool("ignorePlaying")
            ActivityType.STREAMING -> bool("ignoreStreaming")
            ActivityType.LISTENING -> bool("ignoreListening")
            ActivityType.WATCHING -> bool("ignoreWatching")
            ActivityType.COMPETING -> bool("ignoreCompeting")
            else -> false
        }
    }

    private fun importCustomRpc() {
        val id = PluginManager.plugins["CustomRPC"]?.settings?.getString("appID", "")?.trim().orEmpty()
        if (id.isEmpty()) {
            Utils.showToast(I18n.t("CustomRPC application ID is not set."))
            return
        }
        val ids = LinkedHashSet(list("idsList"))
        if (!ids.add(id)) {
            Utils.showToast(I18n.t("CustomRPC application ID is already added."))
            return
        }
        settings.setString("idsList", ids.joinToString(", "))
        Utils.showToast(I18n.t("Added the CustomRPC application ID to the filter list"))
        PresenceHub.refresh()
    }
}
