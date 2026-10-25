/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.anonymisefilenames.AnonymiseFileNames
import com.endcord.plugins.autovaporwave.AutoVaporwave
import com.endcord.plugins.betterplusreacts.BetterPlusReacts
import com.endcord.plugins.charactercounter.CharacterCounter
import com.endcord.plugins.chatgpt.ChatGPT
import com.endcord.plugins.chatgptwriting.ChatGPTWriting
import com.endcord.plugins.clearurls.ClearURLs
import com.endcord.plugins.encryptedmessage.EncryptedMessage
import com.endcord.plugins.messageburst.MessageBurst
import com.endcord.plugins.noreplymention.NoReplyMention
import com.endcord.plugins.polishwording.PolishWording
import com.endcord.plugins.previewmessage.PreviewMessage
import com.endcord.plugins.scheduledmessages.ScheduledMessages
import com.endcord.plugins.sedenhanced.SedEnhanced
import com.endcord.plugins.selfdestruct.SelfDestruct
import com.endcord.plugins.sendtimestamps.SendTimestamps
import com.endcord.plugins.signature.Signature
import com.endcord.plugins.silentmessagetoggle.SilentMessageToggle
import com.endcord.plugins.splitlargemessages.SplitLargeMessages
import com.endcord.plugins.talkinreverse.TalkInReverse
import com.endcord.plugins.textreplace.TextReplace
import com.endcord.plugins.writeuppercase.WriteUpperCase
import com.endcord.plugins.zerowidthsanitizer.ZeroWidthSanitizer

/** Batch 03: plugins that act on the message you are about to send. See docs/plugins/03-composer.md. */
internal fun batch03(): List<EndcordPlugin> = listOf(
    AnonymiseFileNames(),
    AutoVaporwave(),
    BetterPlusReacts(),
    CharacterCounter(),
    ChatGPT(),
    ChatGPTWriting(),
    ClearURLs(),
    EncryptedMessage(),
    MessageBurst(),
    NoReplyMention(),
    PolishWording(),
    PreviewMessage(),
    ScheduledMessages(),
    SedEnhanced(),
    SelfDestruct(),
    SendTimestamps(),
    Signature(),
    SilentMessageToggle(),
    SplitLargeMessages(),
    TalkInReverse(),
    TextReplace(),
    WriteUpperCase(),
    ZeroWidthSanitizer(),
)
