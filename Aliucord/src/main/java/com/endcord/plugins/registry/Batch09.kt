/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.alwaysexpandprofiles.AlwaysExpandProfiles
import com.endcord.plugins.betterblockedusers.BetterBlockedUsers
import com.endcord.plugins.betterrolecontext.BetterRoleContext
import com.endcord.plugins.cancelfriendrequest.CancelFriendRequest
import com.endcord.plugins.cancelfriendrequestnc.CancelFriendRequestNC
import com.endcord.plugins.clickableroles.ClickableRoles
import com.endcord.plugins.githubrepos.GitHubRepos
import com.endcord.plugins.globalbadges.GlobalBadges
import com.endcord.plugins.mutualgroupdms.MutualGroupDMs
import com.endcord.plugins.permissionsviewer.PermissionsViewer
import com.endcord.plugins.reviewdb.ReviewDB
import com.endcord.plugins.showtimeoutduration.ShowTimeoutDuration
import com.endcord.plugins.userpfp.UserPFP
import com.endcord.plugins.usrbg.USRBG

internal fun batch09(): List<EndcordPlugin> = listOf(
    AlwaysExpandProfiles(),
    BetterBlockedUsers(),
    BetterRoleContext(),
    CancelFriendRequest(),
    CancelFriendRequestNC(),
    ClickableRoles(),
    GitHubRepos(),
    GlobalBadges(),
    MutualGroupDMs(),
    PermissionsViewer(),
    ReviewDB(),
    ShowTimeoutDuration(),
    UserPFP(),
    USRBG(),
)
