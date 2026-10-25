/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.channelbadges.ChannelBadges
import com.endcord.plugins.cleanchannelname.CleanChannelName
import com.endcord.plugins.cleanerchannelgroups.CleanerChannelGroups
import com.endcord.plugins.fastdeletechannels.FastDeleteChannels
import com.endcord.plugins.hideservers.HideServers
import com.endcord.plugins.messagepeek.MessagePeek
import com.endcord.plugins.newguildsettings.NewGuildSettings
import com.endcord.plugins.pindms.PinDMs
import com.endcord.plugins.readallnotificationsbutton.ReadAllNotificationsButton
import com.endcord.plugins.serverinfo.ServerInfo
import com.endcord.plugins.serverpinner.ServerPinner
import com.endcord.plugins.showhiddenchannels.ShowHiddenChannels

internal fun batch11(): List<EndcordPlugin> = listOf(
    ChannelBadges(),
    CleanChannelName(),
    CleanerChannelGroups(),
    FastDeleteChannels(),
    HideServers(),
    MessagePeek(),
    NewGuildSettings(),
    PinDMs(),
    ReadAllNotificationsButton(),
    ServerInfo(),
    ServerPinner(),
    ShowHiddenChannels(),
)
