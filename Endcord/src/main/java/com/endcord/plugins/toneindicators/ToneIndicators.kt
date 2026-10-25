/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.toneindicators

import android.content.Context
import android.text.SpannableStringBuilder
import android.text.Spanned
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.api.TapSpan
import com.endcord.plugins.api.isCodeOrLink
import java.util.Locale
import java.util.regex.Pattern

internal class ToneIndicators : EndcordPlugin(
    name = "ToneIndicators",
    description = "Show tooltips for tone indicators like /srs, /gen, etc. in sent messages.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Text("prefix", "Prefix character(s) for tone indicators.", default = "/"),
        PluginSetting.Text("customIndicators", "Custom tone indicators (format: jk=Joking; srs=Serious)"),
    )

    private class Compiled(val prefix: String, val custom: String, val pattern: Pattern, val customMap: Map<String, String>)

    @Volatile
    private var compiled: Compiled? = null

    private fun prefix() = string("prefix").ifEmpty { "/" }

    private fun parseCustom(raw: String): Map<String, String> {
        val result = HashMap<String, String>()
        for (entry in raw.split(';')) {
            val eq = entry.indexOf('=')
            if (eq <= 0) continue
            val key = entry.substring(0, eq).trim().lowercase(Locale.ROOT)
            val value = entry.substring(eq + 1).trim()
            if (key.isNotEmpty() && value.isNotEmpty()) result[key] = value
        }
        return result
    }

    /** Port of Endcord PC's buildIndicatorRegex, rebuilt only when the settings change. */
    private fun compiled(): Compiled {
        val prefix = prefix()
        val custom = string("customIndicators")
        compiled?.let { if (it.prefix == prefix && it.custom == custom) return it }

        val customMap = parseCustom(custom)
        val all = LinkedHashSet<String>()
        for (key in INDICATORS.keys) all += key.removePrefix("_")
        for (key in customMap.keys) all += key.removePrefix("_")
        // Longest first so that e.g. /srs is not read as /s
        val alternatives = all.sortedByDescending { it.length }.joinToString("|") { Pattern.quote(it) }
        val pattern = Pattern.compile(
            "(?:^|\\s)${Pattern.quote(prefix)}($alternatives)(?=\\s|$|[^\\s\\w/])",
            Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE,
        )
        return Compiled(prefix, custom, pattern, customMap).also { compiled = it }
    }

    private fun describe(indicator: String, customMap: Map<String, String>): String? {
        val key = indicator.lowercase(Locale.ROOT)
        customMap[key]?.let { return it }
        customMap["_$key"]?.let { return it }
        val builtIn = INDICATORS[key] ?: INDICATORS["_$key"] ?: return null
        return I18n.t(builtIn)
    }

    private val decorator = object : ChatDecorator(name, priority = 20) {
        override fun decorateText(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, text: SpannableStringBuilder) {
            val content = entry.message.content ?: return
            val prefix = prefix()
            if (content.indexOf(prefix) < 0) return

            val c = compiled()
            val matcher = c.pattern.matcher(text)
            while (matcher.find()) {
                val indicator = matcher.group(1) ?: continue
                val description = describe(indicator, c.customMap) ?: continue
                val start = matcher.start(1) - c.prefix.length
                val end = matcher.end(1)
                if (start < 0 || text.isCodeOrLink(start, end)) continue

                val label = c.prefix + indicator
                // There is no hover on a phone, so a tap shows what the indicator means
                text.setSpan(TapSpan(underline = true) { Utils.showToast("$label: $description") }, start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        }
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        compiled = null
        super.stop(context)
    }

    private companion object {
        /** Endcord PC's default indicators; keys starting with `_` are aliases. */
        val INDICATORS = linkedMapOf(
            "j" to "Joking",
            "hj" to "Half Joking",
            "s" to "Sarcastic",
            "_sarc" to "Sarcastic",
            "gen" to "Genuine",
            "_g" to "Genuine",
            "genq" to "Genuine Question",
            "_gq" to "Genuine Question",
            "srs" to "Serious",
            "nsrs" to "Non-Serious",
            "pos" to "Positive Connotation",
            "_pc" to "Positive Connotation",
            "neu" to "Neutral Connotation",
            "neg" to "Negative Connotation",
            "_nc" to "Negative Connotation",
            "p" to "Platonic",
            "r" to "Romantic",
            "a" to "Alterous",
            "c" to "Copypasta",
            "l" to "Lyrics",
            "_ly" to "Lyrics",
            "lh" to "Light-Hearted",
            "nm" to "Not Mad",
            "lu" to "A Little Upset",
            "nbh" to "Not Directed At Anybody Here",
            "nay" to "Not Directed At You",
            "ay" to "Directed At You",
            "nsb" to "Not Subtweeting",
            "x" to "Sexual Intent",
            "_sx" to "Sexual Intent",
            "nx" to "Non-Sexual Intent",
            "_nsx" to "Non-Sexual Intent",
            "rh" to "Rhetorical Question",
            "_rt" to "Rhetorical Question",
            "t" to "Teasing",
            "ij" to "Inside Joke",
            "m" to "Metaphorically",
            "li" to "Literally",
            "hyp" to "Hyperbole",
            "ex" to "Exaggeration",
            "f" to "Fake",
            "q" to "Quote",
            "th" to "Threat",
            "cb" to "Clickbait",
            "ref" to "Reference",
            "nf" to "Not Forced",
            "nbr" to "Not Being Rude",
            "ot" to "Off-Topic",
            "nj" to "Not Joking",
            "naj" to "Not A Joke",
        )
    }
}
