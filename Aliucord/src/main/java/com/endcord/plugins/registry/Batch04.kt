/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.blockkeywords.BlockKeywords
import com.endcord.plugins.blurnsfw.BlurNSFW
import com.endcord.plugins.clientsideblock.ClientSideBlock
import com.endcord.plugins.contentwarning.ContentWarning
import com.endcord.plugins.hidemedia.HideMedia
import com.endcord.plugins.hidemessages.HideMessages
import com.endcord.plugins.messagelogger.MessageLogger
import com.endcord.plugins.noblockedmessages.NoBlockedMessages
import com.endcord.plugins.revealallspoilers.RevealAllSpoilers
import com.endcord.plugins.silentdelete.SilentDelete
import com.endcord.plugins.silentedit.SilentEdit
import com.endcord.plugins.stickerblocker.StickerBlocker

internal fun batch04(): List<EndcordPlugin> = listOf(
    BlockKeywords(),
    BlurNSFW(),
    ClientSideBlock(),
    ContentWarning(),
    HideMedia(),
    HideMessages(),
    MessageLogger(),
    NoBlockedMessages(),
    RevealAllSpoilers(),
    SilentDelete(),
    SilentEdit(),
    StickerBlocker(),
)
