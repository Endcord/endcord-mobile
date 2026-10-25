/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.keywordnotify

import android.content.Context
import android.content.ContextWrapper
import androidx.fragment.app.FragmentActivity
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.embeds.FieldWrapper.Companion.name
import com.aliucord.wrappers.embeds.FieldWrapper.Companion.value
import com.aliucord.wrappers.embeds.MessageEmbedWrapper.Companion.description
import com.aliucord.wrappers.embeds.MessageEmbedWrapper.Companion.rawFields
import com.aliucord.wrappers.embeds.MessageEmbedWrapper.Companion.title
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.notifycommon.IdList
import com.endcord.plugins.notifycommon.Msg
import com.endcord.plugins.notifycommon.Notifier
import com.endcord.plugins.notifycommon.NotifyHooks
import org.json.JSONArray
import org.json.JSONObject
import java.util.regex.Pattern

internal class KeywordNotify : EndcordPlugin(
    name = "KeywordNotify",
    description = "Sends a notification if a given message matches certain keywords or regexes",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "notifications")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            "keywords",
            "Keywords",
            "One keyword or regular expression per line. Matching messages ping you like a mention.",
            placeholder = "endcord\n\\bmy ?name\\b",
            multiline = true,
        ),
        PluginSetting.Switch("ignoreCase", "Ignore case"),
        PluginSetting.Switch("ignoreBots", "Ignore bots", "Ignore messages from bots", true),
        PluginSetting.Text(
            "whitelist",
            "Whitelist",
            "Only match in these servers or channels, or from these users (ids, comma separated)",
            multiline = true,
        ),
        PluginSetting.Text(
            "blacklist",
            "Blacklist",
            "Never match in these servers or channels, or from these users (ids, comma separated)",
            multiline = true,
        ),
        PluginSetting.Switch(
            "whitelistPriority",
            "Whitelist wins",
            "When an id is in both lists, match anyway",
        ),
        PluginSetting.Number("amountToKeep", "Log size", "Amount of messages to keep in the log", 50, 1, 500),
        PluginSetting.Action("showLog", "Show keyword log", "Messages that matched your keywords, newest first") { showLog(it) },
        PluginSetting.Action("clearLog", "Clear keyword log") {
            synchronized(log) { log.clear() }
            saveLog()
            Utils.showToast(I18n.t("Keyword log cleared"))
        },
    )

    private class Entry(
        val id: Long,
        val channelId: Long,
        val authorId: Long,
        val author: String,
        val content: String,
    )

    private val whitelist by lazy { IdList(settings, "whitelist") }
    private val blacklist by lazy { IdList(settings, "blacklist") }
    private val log = ArrayList<Entry>()

    @Volatile private var patternSource: String? = null
    @Volatile private var patterns: List<Pattern> = emptyList()

    override fun start(context: Context) {
        loadLog()
        NotifyHooks.trackAppState(name)
        NotifyHooks.incoming(name, priority = 0) { incoming ->
            if (!matches(incoming)) return@incoming
            val authorId = incoming.author?.id ?: 0L
            if (authorId == Msg.me()) return@incoming
            Msg.addMeToMentions(incoming.target)
            remember(incoming, authorId)

            // Discord shows its own popup for the new "mention" while the app is open; in the background the
            // server sends no push for it, so post one like the desktop notification Endcord PC gets
            val api = incoming.api
            if (incoming.source == NotifyHooks.Source.CREATE && api != null && NotifyHooks.isBackgrounded && Msg.isFresh(api)) {
                Notifier.message(name, api)
            }
        }
    }

    override fun stop(context: Context) {
        NotifyHooks.unregisterAll(name)
        Utils.mainThread.removeCallbacks(saveRunnable)
        saveLog()
        super.stop(context)
    }

    override fun onSettingChanged(key: String) {
        if (key == "amountToKeep") {
            trim()
            saveLog()
        }
    }

    // ---- matching ----

    private fun currentPatterns(): List<Pattern> {
        val source = string("keywords") + "\u0000" + bool("ignoreCase")
        if (source != patternSource) {
            val flags = if (bool("ignoreCase")) Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE else 0
            patterns = string("keywords").split('\n').map { it.trim() }.filter { it.isNotEmpty() }.mapNotNull {
                try {
                    Pattern.compile(it, flags)
                } catch (_: Throwable) {
                    null
                }
            }
            patternSource = source
        }
        return patterns
    }

    private fun matches(incoming: NotifyHooks.Incoming): Boolean {
        val patterns = currentPatterns()
        if (patterns.isEmpty()) return false
        val channelId = incoming.channelId
        val author = incoming.author
        val authorId = author?.id ?: 0L
        val guildId = Common.guildIdOf(channelId) ?: 0L

        val white = whitelist.ids()
        val black = blacklist.ids()
        val inWhite = channelId in white || authorId in white || (guildId != 0L && guildId in white)
        val inBlack = channelId in black || authorId in black || (guildId != 0L && guildId in black)
        if (inWhite && inBlack) {
            if (!bool("whitelistPriority")) return false
        } else {
            if (white.isNotEmpty() && !inWhite) return false
            if (inBlack) return false
        }
        if (author?.e() == true && bool("ignoreBots") && (white.isEmpty() || authorId !in white)) return false

        incoming.content?.let { text -> if (patterns.any { it.matcher(text).find() }) return true }
        for (embed in incoming.embeds.orEmpty()) {
            val texts = ArrayList<String>()
            embed.description?.let { texts += it }
            embed.title?.let { texts += it }
            embed.rawFields?.forEach { texts += it.name; texts += it.value }
            if (texts.any { text -> patterns.any { it.matcher(text).find() } }) return true
        }
        return false
    }

    // ---- log ----

    private fun remember(incoming: NotifyHooks.Incoming, authorId: Long) {
        val entry = Entry(
            incoming.id,
            incoming.channelId,
            authorId,
            Msg.apiName(incoming.author).ifEmpty { Msg.nameOf(authorId) },
            Common.preview(incoming.content, 200),
        )
        synchronized(log) {
            if (log.any { it.id == entry.id }) return
            log.add(entry)
            log.sortByDescending { it.id }
        }
        trim()
        // Loading a chat can match many messages at once: save once things settle
        Utils.mainThread.removeCallbacks(saveRunnable)
        Utils.mainThread.postDelayed(saveRunnable, 2_000L)
    }

    private val saveRunnable = Runnable { saveLog() }

    private fun trim() {
        val keep = int("amountToKeep").coerceIn(1, 500)
        synchronized(log) {
            while (log.size > keep) log.removeAt(log.size - 1)
        }
    }

    private fun loadLog() {
        val text = settings.getString("log", null) ?: return
        try {
            val array = JSONArray(text)
            synchronized(log) {
                log.clear()
                for (i in 0 until array.length()) {
                    val o = array.optJSONObject(i) ?: continue
                    log.add(
                        Entry(
                            o.optLong("id"),
                            o.optLong("channelId"),
                            o.optLong("authorId"),
                            o.optString("author"),
                            o.optString("content"),
                        ),
                    )
                }
            }
        } catch (e: Throwable) {
            logger.error("Failed to read the keyword log", e)
        }
    }

    private fun saveLog() {
        val array = JSONArray()
        synchronized(log) {
            for (entry in log) {
                array.put(
                    JSONObject()
                        .put("id", entry.id)
                        .put("channelId", entry.channelId)
                        .put("authorId", entry.authorId)
                        .put("author", entry.author)
                        .put("content", entry.content),
                )
            }
        }
        val json = array.toString()
        Common.io.execute {
            try {
                settings.setString("log", json)
            } catch (e: Throwable) {
                logger.error("Failed to save the keyword log", e)
            }
        }
    }

    private fun showLog(context: Context) {
        val entries = synchronized(log) { ArrayList(log) }
        if (entries.isEmpty()) {
            Utils.showToast(I18n.t("No messages matched your keywords yet"))
            return
        }
        val activity = activityOf(context) ?: return
        val items = entries.map { entry ->
            val time = Common.formatTime(Msg.timeOf(entry.id))
            "${entry.author} · ${Common.channelTitle(entry.channelId)} · $time\n${entry.content.ifEmpty { I18n.t("(no text)") }}"
        }
        Common.pick(activity.supportFragmentManager, I18n.t("Keyword log"), items) { index ->
            val entry = entries[index]
            Common.openMessage(activity, entry.channelId, entry.id)
        }
    }

    private fun activityOf(context: Context): FragmentActivity? {
        var current: Context? = context
        while (current is ContextWrapper) {
            if (current is FragmentActivity) return current
            current = current.baseContext
        }
        return try {
            Utils.appActivity
        } catch (_: Throwable) {
            null
        }
    }
}
