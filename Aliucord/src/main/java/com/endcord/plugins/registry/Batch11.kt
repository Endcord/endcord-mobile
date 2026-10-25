/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.showhiddenchannels.ShowHiddenChannels

internal fun batch11(): List<EndcordPlugin> = listOf(
    ShowHiddenChannels(),
)
