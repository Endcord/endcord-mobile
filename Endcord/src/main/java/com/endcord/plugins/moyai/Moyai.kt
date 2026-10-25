/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.moyai

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.endcord.plugins.notifycommon.Msg
import com.endcord.plugins.notifycommon.NotifyHooks
import com.endcord.plugins.notifycommon.Sounds
import com.discord.stores.StoreStream
import java.util.Locale
import java.util.regex.Pattern

internal class Moyai : EndcordPlugin(
    name = "Moyai",
    description = "Plays a 🗿 sound effect whenever a moyai emoji is sent or reacted in your current channel.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("fun")

    override val settingsSchema = listOf(
        PluginSetting.Number("volume", "Volume", "Volume of the 🗿🗿🗿, in percent", 50, 0, 100),
        PluginSetting.Choice(
            "quality",
            "Quality",
            "Quality of the 🗿🗿🗿",
            listOf(PluginSetting.Choice.Option("Normal", "Normal"), PluginSetting.Choice.Option("HD", "HD")),
        ),
        PluginSetting.Switch("ignoreBots", "Ignore bots", "Ignore bots", true),
        PluginSetting.Switch("ignoreBlocked", "Ignore blocked users", "Ignore blocked users", true),
    )

    private val pending = ArrayList<Runnable>()

    override fun start(context: Context) {
        NotifyHooks.trackAppState(name)
        Sounds.preload(url())

        NotifyHooks.messages(name) { message ->
            val content = message.i()
            if (content.isNullOrEmpty() || !Msg.isFresh(message) || !Msg.isViewing(message.g())) return@messages
            if (bool("ignoreBots") && Msg.isBot(message)) return@messages
            if (bool("ignoreBlocked") && Msg.isBlocked(Msg.authorId(message))) return@messages
            val count = moyaiCount(content)
            if (count == 0) return@messages
            Utils.mainThread.post {
                for (i in 0 until count) schedule(i * 300L)
            }
        }
        NotifyHooks.reactions(name) { update ->
            if (!Msg.isViewing(update.a()) || update.d() == Msg.me()) return@reactions
            if (bool("ignoreBots") && StoreStream.getUsers().users[update.d()]?.isBot == true) return@reactions
            if (bool("ignoreBlocked") && Msg.isBlocked(update.d())) return@reactions
            val emoji = update.b()?.d()?.lowercase(Locale.ROOT) ?: return@reactions
            if (emoji != MOYAI && !emoji.contains("moyai") && !emoji.contains("moai")) return@reactions
            Utils.mainThread.post { schedule(0L) }
        }
    }

    override fun onSettingChanged(key: String) {
        if (key == "quality") Sounds.preload(url())
    }

    override fun stop(context: Context) {
        NotifyHooks.unregisterAll(name)
        synchronized(pending) {
            pending.forEach { Utils.mainThread.removeCallbacks(it) }
            pending.clear()
        }
        Sounds.release()
        super.stop(context)
    }

    private fun url() = if (choice("quality") == "HD") URL_HD else URL

    private fun schedule(delay: Long) {
        val runnable = object : Runnable {
            override fun run() {
                synchronized(pending) { pending.remove(this) }
                boom()
            }
        }
        synchronized(pending) { pending.add(runnable) }
        Utils.mainThread.postDelayed(runnable, delay)
    }

    private fun boom() {
        // Only while the user is in the app looking at the chat, like the PC plugin's focused window
        if (NotifyHooks.isBackgrounded) return
        Sounds.play(url(), int("volume") / 100f)
    }

    private fun moyaiCount(content: String): Int {
        var count = 0
        var index = content.indexOf(MOYAI)
        while (index >= 0) {
            count++
            index = content.indexOf(MOYAI, index + MOYAI.length)
        }
        val matcher = customMoyai.matcher(content)
        while (matcher.find()) count++
        return count.coerceAtMost(10)
    }

    private companion object {
        const val MOYAI = "🗿"
        const val URL = "https://github.com/Equicord/Equibored/raw/main/sounds/moyai/moyai.mp3"
        const val URL_HD = "https://github.com/Equicord/Equibored/raw/main/sounds/moyai/moyai.wav"
        val customMoyai: Pattern = Pattern.compile("<a?:\\w*moy?ai\\w*:\\d{17,20}>", Pattern.CASE_INSENSITIVE)
    }
}
