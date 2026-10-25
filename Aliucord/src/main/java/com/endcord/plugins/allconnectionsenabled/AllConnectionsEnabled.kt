/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.allconnectionsenabled

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.patcher.instead
import com.discord.stores.StoreExperiments
import com.discord.utilities.platform.Platform
import com.discord.widgets.playstation.PlaystationExperimentUtilsKt
import de.robv.android.xposed.XC_MethodHook

/**
 * The "Add connection" list of the Android app only shows the [Platform]s marked enabled (it hides Battle.net,
 * League of Legends, Samsung Galaxy and Skype) and puts PlayStation behind an experiment. This shows them all.
 * Like on Endcord PC, it doesn't make a connection work if Discord no longer supports it.
 */
internal class AllConnectionsEnabled : EndcordPlugin(
    name = "AllConnectionsEnabled",
    description = "Enables all connections",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility", "customisation")

    override fun start(context: Context) {
        patcher.instead<Platform>("getEnabled") { this != Platform.NONE }

        // Static, so it can't go through patcher.instead
        val playstation = PlaystationExperimentUtilsKt::class.java
            .getDeclaredMethod("canSeePlaystationAccountIntegration", StoreExperiments::class.java)
        patcher.patch(playstation, object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                param.result = true
            }
        })
    }
}
