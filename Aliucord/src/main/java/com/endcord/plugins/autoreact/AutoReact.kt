/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.autoreact

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.endcord.plugins.notifycommon.Msg
import com.endcord.plugins.notifycommon.NotifyHooks
import com.endcord.plugins.notifycommon.Reactions
import org.json.JSONArray
import java.util.Locale

internal class AutoReact : EndcordPlugin(
    name = "AutoReact",
    description = "Automatically react to messages containing specific keywords.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility", "chat")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            "rules",
            "Rules",
            "One rule per line as keyword = emoji, for example lol = 😂. Custom emojis: use <:name:id> format. " +
                "A JSON array of rules from Endcord PC works too.",
            placeholder = "lol = 😂\ngg = 🎉",
            multiline = true,
        ),
        PluginSetting.Switch("caseSensitive", "Case sensitive", "Only match keywords with the same capitalization"),
        PluginSetting.Switch("onlyOwnMessages", "Only my messages", "Only auto-react to messages you send."),
        PluginSetting.Switch("ignoreBots", "Ignore bots", "Skip messages from bots.", true),
    )

    private class Rule(val keyword: String, val emoji: String, val caseSensitive: Boolean)

    @Volatile private var rulesSource: String? = null
    @Volatile private var rules: List<Rule> = emptyList()

    override fun start(context: Context) {
        NotifyHooks.messages(name) { message ->
            val content = message.i()
            if (content.isNullOrEmpty() || !Msg.isFresh(message)) return@messages
            if (bool("onlyOwnMessages") && !Msg.isOwn(message)) return@messages
            if (bool("ignoreBots") && Msg.isBot(message)) return@messages

            val lower = content.lowercase(Locale.ROOT)
            var added = 0
            for (rule in currentRules()) {
                val found = if (rule.caseSensitive) content.contains(rule.keyword) else lower.contains(rule.keyword.lowercase(Locale.ROOT))
                if (!found) continue
                Reactions.add(message.g(), message.o(), rule.emoji)
                // Discord allows 20 different reactions per message
                if (++added >= 20) break
            }
        }
    }

    override fun stop(context: Context) {
        NotifyHooks.unregisterAll(name)
        super.stop(context)
    }

    private fun currentRules(): List<Rule> {
        val text = string("rules")
        val source = text + "\u0000" + bool("caseSensitive")
        if (source == rulesSource) return rules
        val parsed = ArrayList<Rule>()
        val trimmed = text.trim()
        if (trimmed.startsWith("[")) {
            try {
                val array = JSONArray(trimmed)
                for (i in 0 until array.length()) {
                    val o = array.optJSONObject(i) ?: continue
                    val keyword = o.optString("keyword")
                    val emoji = o.optString("emoji")
                    if (keyword.isNotEmpty() && emoji.isNotEmpty()) {
                        parsed += Rule(keyword, emoji, o.optBoolean("caseSensitive", bool("caseSensitive")))
                    }
                }
            } catch (e: Throwable) {
                logger.warn("Failed to parse the rules JSON")
            }
        } else {
            for (line in trimmed.split('\n')) {
                val separator = line.lastIndexOf('=')
                if (separator <= 0) continue
                val keyword = line.substring(0, separator).trim()
                val emoji = line.substring(separator + 1).trim()
                if (keyword.isNotEmpty() && emoji.isNotEmpty()) parsed += Rule(keyword, emoji, bool("caseSensitive"))
            }
        }
        rules = parsed
        rulesSource = source
        return rules
    }
}
