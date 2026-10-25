/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.alwaystrust

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.patcher.instead
import com.discord.stores.StoreMaskedLinks

internal class AlwaysTrust : EndcordPlugin(
    name = "AlwaysTrust",
    description = "Removes the annoying untrusted domain and suspicious file popup",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility")

    override fun start(context: Context) {
        // Asked before opening a link: false shows the "Leaving Discord" popup for an untrusted domain.
        // The Android app has no suspicious download popup, so this is the only one to remove.
        patcher.instead<StoreMaskedLinks>("isTrustedDomain", String::class.java, String::class.java) { true }
    }
}
