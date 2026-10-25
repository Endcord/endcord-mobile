/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.alwaystrust.AlwaysTrust
import com.endcord.plugins.customrpc.CustomRPC
import com.endcord.plugins.defaultstatusforever.DefaultStatusForever
import com.endcord.plugins.experiments.Experiments
import com.endcord.plugins.ignoreactivities.IgnoreActivities
import com.endcord.plugins.lastfmrichpresence.LastFMRichPresence
import com.endcord.plugins.musicrichpresence.MusicRichPresence
import com.endcord.plugins.platformspoofer.PlatformSpoofer
import com.endcord.plugins.showsongname.ShowSongName
import com.endcord.plugins.statuspresets.StatusPresets

internal fun batch14(): List<EndcordPlugin> = listOf(
    AlwaysTrust(),
    CustomRPC(),
    DefaultStatusForever(),
    Experiments(),
    IgnoreActivities(),
    LastFMRichPresence(),
    MusicRichPresence(),
    PlatformSpoofer(),
    ShowSongName(),
    StatusPresets(),
)
