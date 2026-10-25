/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.registry.*

/**
 * Every plugin built into Endcord. Ports are registered in the `registry` batch files so that work on
 * different plugins never touches the same file.
 */
internal object EndcordPlugins {
    fun create(): List<EndcordPlugin> = ArrayList<EndcordPlugin>().apply {
        addAll(batch01())
        addAll(batch02())
        addAll(batch03())
        addAll(batch04())
        addAll(batch05())
        addAll(batch06())
        addAll(batch07())
        addAll(batch08())
        addAll(batch09())
        addAll(batch10())
        addAll(batch11())
        addAll(batch12())
        addAll(batch13())
        addAll(batch14())
        addAll(batch15())
        addAll(batch16())
    }.sortedBy { it.name.lowercase() }
}
