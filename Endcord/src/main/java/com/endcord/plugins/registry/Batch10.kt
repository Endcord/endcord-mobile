/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.accountpanelserverprofile.AccountPanelServerProfile
import com.endcord.plugins.allconnectionsenabled.AllConnectionsEnabled
import com.endcord.plugins.antinickname.AntiNickname
import com.endcord.plugins.colorsighted.ColorSighted
import com.endcord.plugins.customfoldericons.CustomFolderIcons
import com.endcord.plugins.fakeprofilethemes.FakeProfileThemes
import com.endcord.plugins.hypesquadswitcher.HypeSquadSwitcher
import com.endcord.plugins.universalmention.UniversalMention
import com.endcord.plugins.unlockedavatarzoom.UnlockedAvatarZoom

internal fun batch10(): List<EndcordPlugin> = listOf(
    AccountPanelServerProfile(),
    AllConnectionsEnabled(),
    AntiNickname(),
    ColorSighted(),
    CustomFolderIcons(),
    FakeProfileThemes(),
    HypeSquadSwitcher(),
    UniversalMention(),
    UnlockedAvatarZoom(),
)
