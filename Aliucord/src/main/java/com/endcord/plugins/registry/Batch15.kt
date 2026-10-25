/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.antimovedeco.AntiMoveDeco
import com.endcord.plugins.calltimer.CallTimer
import com.endcord.plugins.fakedeafen.FakeDeafen
import com.endcord.plugins.fakemute.FakeMute
import com.endcord.plugins.followuser.FollowUser
import com.endcord.plugins.nopushtotalk.NoPushToTalk
import com.endcord.plugins.universalvolume.UniversalVolume
import com.endcord.plugins.vcnarrator.VcNarrator
import com.endcord.plugins.voicechatutilities.VoiceChatUtilities
import com.endcord.plugins.voicecount.VoiceCount
import com.endcord.plugins.voicejoinmessages.VoiceJoinMessages
import com.endcord.plugins.voicerejoin.VoiceRejoin
import com.endcord.plugins.volumebooster.VolumeBooster
import com.endcord.plugins.waitforslot.WaitForSlot
import com.endcord.plugins.webcamstartnotifier.WebcamStartNotifier

internal fun batch15(): List<EndcordPlugin> = listOf(
    CallTimer(),
    FakeMute(),
    FakeDeafen(),
    FollowUser(),
    VoiceRejoin(),
    WaitForSlot(),
    VoiceJoinMessages(),
    VcNarrator(),
    VoiceCount(),
    VoiceChatUtilities(),
    UniversalVolume(),
    VolumeBooster(),
    NoPushToTalk(),
    AntiMoveDeco(),
    WebcamStartNotifier(),
)
