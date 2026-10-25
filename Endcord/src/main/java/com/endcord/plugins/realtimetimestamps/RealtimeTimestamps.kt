/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.realtimetimestamps

import android.content.Context
import android.widget.TextView
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.messagesbcommon.MomentFormat

internal class RealtimeTimestamps : EndcordPlugin(
    name = "RealtimeTimestamps",
    description = "Replaces Discord timestamps (e.g. 15:31) with live seconds (e.g. 15:34:21), updated every second.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "chat", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            key = "format",
            label = "Seconds format displayed on every message timestamp",
            options = listOf(
                PluginSetting.Choice.Option("HH:mm:ss", "15:34:21  (24h)"),
                PluginSetting.Choice.Option("h:mm:ss A", "3:34:21 PM  (12h)"),
            ),
        ),
    )

    // A message's send time never changes, so formatting it when the row is shown is enough; the last
    // result is reused because messages sent in the same second are common in busy channels
    private var lastSecond = Long.MIN_VALUE
    private var lastFormat = ""
    private var lastResult = ""

    private val decorator = object : ChatDecorator(name) {
        override fun formatTimestamp(entry: MessageEntry, millis: Long, view: TextView): CharSequence {
            val format = choice("format").ifEmpty { "HH:mm:ss" }
            val second = millis / 1000
            if (second == lastSecond && format == lastFormat) return lastResult
            val result = MomentFormat.format(millis, format)
            lastSecond = second
            lastFormat = format
            lastResult = result
            return result
        }
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        lastSecond = Long.MIN_VALUE
        super.stop(context)
    }
}
