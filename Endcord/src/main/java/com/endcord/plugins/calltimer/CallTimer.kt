/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.calltimer

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.endcord.plugins.voicecommon.CallIndicator
import com.endcord.plugins.voicecommon.Voice
import com.endcord.plugins.voicecommon.VoiceEvents

internal class CallTimer : EndcordPlugin(
    name = "CallTimer",
    description = "Shows how long you have been in the current voice call",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("voice", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            "format",
            "The timer format",
            options = listOf(
                PluginSetting.Choice.Option("stopwatch", "30d 23:00:42"),
                PluginSetting.Choice.Option("human", "30d 23h 00m 42s"),
            ),
        ),
    )

    /** The channel the timer runs for and when it started; like PC, the timer restarts when the channel changes. */
    @Volatile
    private var channelId = 0L

    @Volatile
    private var startedAt = 0L

    /** Port of Endcord PC's formatDuration. */
    private fun format(ms: Long): String {
        val human = choice("format") == "human"
        fun num(n: Long) = if (human) n.toString() else n.toString().padStart(2, '0')
        fun unit(s: String) = if (human) s else ""
        val delim = if (human) " " else ":"

        val d = ms / 86_400_000L
        val h = ms % 86_400_000L / 3_600_000L
        val m = ms % 3_600_000L / 60_000L
        val s = ms % 60_000L / 1000L

        val res = StringBuilder()
        if (d > 0) res.append(d).append("d ")
        if (h > 0 || res.isNotEmpty()) res.append(num(h)).append(unit("h")).append(delim)
        if (m > 0 || res.isNotEmpty() || !human) res.append(num(m)).append(unit("m")).append(delim)
        res.append(num(s)).append(unit("s"))
        return res.toString()
    }

    override fun start(context: Context) {
        // Already in a call when the plugin starts: the join time isn't known, count from now
        channelId = Voice.myChannelId()
        startedAt = System.currentTimeMillis()

        VoiceEvents.register(name) { change ->
            if (!change.isMe || !change.channelChanged) return@register
            channelId = change.newChannelId ?: 0L
            startedAt = System.currentTimeMillis()
            Utils.mainThread.post { CallIndicator.refresh() }
        }
        CallIndicator.register(name, ticking = true) {
            val current = Voice.myChannelId()
            if (current == 0L) return@register null
            if (current != channelId) {
                channelId = current
                startedAt = System.currentTimeMillis()
            }
            format((System.currentTimeMillis() - startedAt).coerceAtLeast(0L))
        }
    }

    override fun onSettingChanged(key: String) {
        CallIndicator.refresh()
    }

    override fun stop(context: Context) {
        super.stop(context)
        VoiceEvents.unregisterAll(name)
        CallIndicator.unregisterAll(name)
    }
}
