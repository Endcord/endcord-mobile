/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.betterinvites.BetterInvites
import com.endcord.plugins.hometyping.HomeTyping
import com.endcord.plugins.invitedefaults.InviteDefaults
import com.endcord.plugins.nopendingcount.NoPendingCount
import com.endcord.plugins.notypinganimation.NoTypingAnimation
import com.endcord.plugins.onefa.OneFA
import com.endcord.plugins.pauseinvitesforever.PauseInvitesForever
import com.endcord.plugins.showtypingusers.ShowTypingUsers
import com.endcord.plugins.typingindicator.TypingIndicator

internal fun batch12(): List<EndcordPlugin> = listOf(
    BetterInvites(),
    HomeTyping(),
    InviteDefaults(),
    NoPendingCount(),
    NoTypingAnimation(),
    OneFA(),
    PauseInvitesForever(),
    ShowTypingUsers(),
    TypingIndicator(),
)
