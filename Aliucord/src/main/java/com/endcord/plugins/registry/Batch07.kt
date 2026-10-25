/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.bookmarks.Bookmarks
import com.endcord.plugins.channelnotes.ChannelNotes
import com.endcord.plugins.copyemojimarkdown.CopyEmojiMarkdown
import com.endcord.plugins.copyfilecontents.CopyFileContents
import com.endcord.plugins.copymedialink.CopyMediaLink
import com.endcord.plugins.copyprofilecolors.CopyProfileColors
import com.endcord.plugins.copystatusurls.CopyStatusUrls
import com.endcord.plugins.copystickerlinks.CopyStickerLinks
import com.endcord.plugins.copyusermention.CopyUserMention
import com.endcord.plugins.copyuserurls.CopyUserURLs
import com.endcord.plugins.downloadallattachments.DownloadAllAttachments
import com.endcord.plugins.exportmessages.ExportMessages
import com.endcord.plugins.findreply.FindReply
import com.endcord.plugins.jumpto.JumpTo
import com.endcord.plugins.messagereminders.MessageReminders
import com.endcord.plugins.messagetags.MessageTags
import com.endcord.plugins.quickmention.QuickMention
import com.endcord.plugins.quoter.Quoter
import com.endcord.plugins.repeatmessages.RepeatMessages
import com.endcord.plugins.reverseimagesearch.ReverseImageSearch
import com.endcord.plugins.textscreenshot.TextScreenshot
import com.endcord.plugins.viewraw.ViewRaw

internal fun batch07(): List<EndcordPlugin> = listOf(
    Bookmarks(),
    ChannelNotes(),
    CopyEmojiMarkdown(),
    CopyFileContents(),
    CopyMediaLink(),
    CopyProfileColors(),
    CopyStatusUrls(),
    CopyStickerLinks(),
    CopyUserMention(),
    CopyUserURLs(),
    DownloadAllAttachments(),
    ExportMessages(),
    FindReply(),
    JumpTo(),
    MessageReminders(),
    MessageTags(),
    QuickMention(),
    Quoter(),
    RepeatMessages(),
    ReverseImageSearch(),
    TextScreenshot(),
    ViewRaw(),
)
