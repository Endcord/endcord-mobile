/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.silenttyping.SilentTyping
import com.endcord.plugins.textcommands.ReverseText

internal fun batch01(): List<EndcordPlugin> = listOf(
    ReverseText(),
    SilentTyping(),
)
