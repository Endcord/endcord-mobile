/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins

import com.aliucord.PluginManager

/**
 * Plugins that change the same part of Discord in ways that don't combine: with both on, one of them silently
 * stops working. Turning one on offers to turn the other off. Mirrors Endcord PC's conflict list, minus pairs that
 * work together on mobile (CleanerChannelGroups + ShowHiddenChannels); pairs whose plugins aren't built in are ignored.
 */
object PluginConflicts {
    private val pairs: List<Pair<String, String>> = listOf(
        "MusicControls" to "SpotifyControls",
        "CustomTimestamps" to "RealtimeTimestamps",
        "MessageLogger" to "MessageLoggerEnhanced",
        "AnonymiseFileNames" to "ClipUpload",
        "BetterActivities" to "ReviewDB",
        "BetterRoleContext" to "RoleColorEverywhere",
        "BetterScreenShare" to "FakeNitro",
        "ContentWarning" to "PinIcon",
        "CustomUserColors" to "IrcColors",
        "RoleColorEverywhere" to "VoiceFakeDetector",
    )

    /** Every plugin that conflicts with [pluginName]. */
    @JvmStatic
    fun conflictsOf(pluginName: String): List<String> = pairs.mapNotNull { (a, b) ->
        when (pluginName) {
            a -> b
            b -> a
            else -> null
        }
    }.filter { it in PluginManager.plugins }

    /** The plugins conflicting with [pluginName] that are turned on right now. */
    @JvmStatic
    fun enabledConflictsOf(pluginName: String): List<String> =
        conflictsOf(pluginName).filter { PluginManager.isPluginEnabled(it) }
}
