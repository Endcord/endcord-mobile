/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.dontroundmytimestamps

import android.content.Context
import com.aliucord.entities.EndcordPlugin

/**
 * Discord's own relative timestamps (`<t:…:R>`) on Android already round down, through
 * `DateUtils.getRelativeTimeSpanString`, so this only affects the relative times Endcord renders itself: the
 * `[relative]` placeholder of CustomTimestamps, which checks whether this plugin is on.
 */
internal class DontRoundMyTimestamps : EndcordPlugin(
    name = "DontRoundMyTimestamps",
    description = "Always rounds relative timestamps down, so 7.6y becomes 7y instead of 8y",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "utility")

    override fun start(context: Context) {}
}
