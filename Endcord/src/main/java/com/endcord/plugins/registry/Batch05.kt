/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.customtimestamps.CustomTimestamps
import com.endcord.plugins.dontroundmytimestamps.DontRoundMyTimestamps
import com.endcord.plugins.embeddedurls.EmbeddedURLs
import com.endcord.plugins.fixcodeblockgap.FixCodeblockGap
import com.endcord.plugins.imagelink.ImageLink
import com.endcord.plugins.messagecolors.MessageColors
import com.endcord.plugins.messagelatency.MessageLatency
import com.endcord.plugins.morejumboemoji.MoreJumboEmoji
import com.endcord.plugins.pinicon.PinIcon
import com.endcord.plugins.reactiontimestamps.ReactionTimestamps
import com.endcord.plugins.realtimetimestamps.RealtimeTimestamps
import com.endcord.plugins.replytimestamp.ReplyTimestamp
import com.endcord.plugins.richmagnetlinks.RichMagnetLinks
import com.endcord.plugins.showmeyourname.ShowMeYourName
import com.endcord.plugins.sortreactions.SortReactions
import com.endcord.plugins.toneindicators.ToneIndicators
import com.endcord.plugins.unindent.Unindent
import com.endcord.plugins.unsuppressembeds.UnsuppressEmbeds
import com.endcord.plugins.urlhighlighter.UrlHighlighter
import com.endcord.plugins.validreply.ValidReply
import com.endcord.plugins.wordcount.WordCount

internal fun batch05(): List<EndcordPlugin> = listOf(
    CustomTimestamps(),
    DontRoundMyTimestamps(),
    EmbeddedURLs(),
    FixCodeblockGap(),
    ImageLink(),
    MessageColors(),
    MessageLatency(),
    MoreJumboEmoji(),
    PinIcon(),
    ReactionTimestamps(),
    RealtimeTimestamps(),
    ReplyTimestamp(),
    RichMagnetLinks(),
    ShowMeYourName(),
    SortReactions(),
    ToneIndicators(),
    Unindent(),
    UnsuppressEmbeds(),
    UrlHighlighter(),
    ValidReply(),
    WordCount(),
)
