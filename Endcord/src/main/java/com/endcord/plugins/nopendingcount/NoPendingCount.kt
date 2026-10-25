/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.nopendingcount

import android.content.Context
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.before
import com.discord.widgets.tabs.TabsHostBottomNavigationView
import com.endcord.plugins.guildsbcommon.GuildsBPlugin

/**
 * The legacy app shows the number of incoming friend requests as a badge on the Friends tab of the bottom bar
 * (`TabsHostBottomNavigationView.updateNotificationBadges(home, friends)`); the friends count is set to zero there.
 * Message requests and Nitro offers don't exist in the legacy app.
 */
internal class NoPendingCount : GuildsBPlugin(
    name = "NoPendingCount",
    description = "Removes the ping count of incoming friend requests, message requests, and nitro offers.",
) {
    override val tags = listOf("notifications", "appearance")

    override val settingsSchema = listOf(
        PluginSetting.Switch("hideFriendRequestsCount", "Hide incoming friend requests count", default = true),
    )

    override fun start(context: Context) {
        patcher.before<TabsHostBottomNavigationView>(
            "updateNotificationBadges", Int::class.javaPrimitiveType!!, Int::class.javaPrimitiveType!!,
        ) { param ->
            if (bool("hideFriendRequestsCount")) param.args[1] = 0
        }
    }
}
