/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.alwaysexpandprofiles.AlwaysExpandProfiles
import com.endcord.plugins.betterrolecontext.BetterRoleContext
import com.endcord.plugins.cancelfriendrequest.CancelFriendRequest
import com.endcord.plugins.cancelfriendrequestnc.CancelFriendRequestNC
import com.endcord.plugins.clickableroles.ClickableRoles
import com.endcord.plugins.mutualgroupdms.MutualGroupDMs
import com.endcord.plugins.permissionsviewer.PermissionsViewer
import com.endcord.plugins.showtimeoutduration.ShowTimeoutDuration

internal fun batch09(): List<EndcordPlugin> = listOf(
    AlwaysExpandProfiles(),
    BetterRoleContext(),
    CancelFriendRequest(),
    CancelFriendRequestNC(),
    ClickableRoles(),
    MutualGroupDMs(),
    PermissionsViewer(),
    ShowTimeoutDuration(),
)
