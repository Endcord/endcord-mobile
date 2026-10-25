/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.autoreact.AutoReact
import com.endcord.plugins.bypassstatus.BypassStatus
import com.endcord.plugins.husk.Husk
import com.endcord.plugins.ignorecalls.IgnoreCalls
import com.endcord.plugins.keywordnotify.KeywordNotify
import com.endcord.plugins.messagenotifier.MessageNotifier
import com.endcord.plugins.pingnotifications.PingNotifications
import com.endcord.plugins.relationshipnotifier.RelationshipNotifier
import com.endcord.plugins.silenceusers.SilenceUsers
import com.endcord.plugins.toastnotifications.ToastNotifications

internal fun batch13(): List<EndcordPlugin> = listOf(
    AutoReact(),
    BypassStatus(),
    Husk(),
    IgnoreCalls(),
    KeywordNotify(),
    MessageNotifier(),
    PingNotifications(),
    RelationshipNotifier(),
    SilenceUsers(),
    ToastNotifications(),
)
