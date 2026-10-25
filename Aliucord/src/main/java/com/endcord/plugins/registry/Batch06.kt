/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.customusercolors.CustomUserColors
import com.endcord.plugins.forceownercrown.ForceOwnerCrown
import com.endcord.plugins.friendshipranks.FriendshipRanks
import com.endcord.plugins.irccolors.IrcColors
import com.endcord.plugins.lastactive.LastActive
import com.endcord.plugins.lastonline.LastOnline
import com.endcord.plugins.moreusertags.MoreUserTags
import com.endcord.plugins.platformindicators.PlatformIndicators
import com.endcord.plugins.rolecoloreverywhere.RoleColorEverywhere
import com.endcord.plugins.showbadgesinchat.ShowBadgesInChat
import com.endcord.plugins.showrolesinchat.ShowRolesInChat
import com.endcord.plugins.timezones.Timezones
import com.endcord.plugins.typingtweaks.TypingTweaks
import com.endcord.plugins.usermessagespronouns.UserMessagesPronouns

internal fun batch06(): List<EndcordPlugin> = listOf(
    ShowBadgesInChat(),
    ShowRolesInChat(),
    RoleColorEverywhere(),
    IrcColors(),
    CustomUserColors(),
    UserMessagesPronouns(),
    Timezones(),
    PlatformIndicators(),
    MoreUserTags(),
    ForceOwnerCrown(),
    FriendshipRanks(),
    LastActive(),
    LastOnline(),
    TypingTweaks(),
)
