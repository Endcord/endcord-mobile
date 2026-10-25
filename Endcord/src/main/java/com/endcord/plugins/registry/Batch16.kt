/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.betterbanreasons.BetterBanReasons
import com.endcord.plugins.customreactionbuttons.CustomReactionButtons
import com.endcord.plugins.dmreadreceipt.DmReadReceipt
import com.endcord.plugins.favoriteemojifirst.FavoriteEmojiFirst
import com.endcord.plugins.fixfileextensions.FixFileExtensions
import com.endcord.plugins.gifpaste.GifPaste
import com.endcord.plugins.livewallpaper.LiveWallpaper
import com.endcord.plugins.markdowntables.MarkdownTables

internal fun batch16(): List<EndcordPlugin> = listOf(
    BetterBanReasons(),
    CustomReactionButtons(),
    DmReadReceipt(),
    FavoriteEmojiFirst(),
    FixFileExtensions(),
    GifPaste(),
    LiveWallpaper(),
    MarkdownTables(),
)
