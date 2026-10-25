/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.avatargrabber.AvatarGrabber
import com.endcord.plugins.boldtext.BoldText
import com.endcord.plugins.calculator.Calculator
import com.endcord.plugins.claptext.ClapText
import com.endcord.plugins.googlethat.GoogleThat
import com.endcord.plugins.leettext.LeetText
import com.endcord.plugins.shipcalc.ShipCalc
import com.endcord.plugins.spaceout.SpaceOut
import com.endcord.plugins.starify.Starify
import com.endcord.plugins.vibecheck.VibeCheck
import com.endcord.plugins.wikilookup.WikiLookup

internal fun batch02(): List<EndcordPlugin> = listOf(
    AvatarGrabber(),
    BoldText(),
    Calculator(),
    ClapText(),
    GoogleThat(),
    LeetText(),
    ShipCalc(),
    SpaceOut(),
    Starify(),
    VibeCheck(),
    WikiLookup(),
)
