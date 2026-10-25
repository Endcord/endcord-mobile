/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.translate

import android.content.Context
import android.text.Spanned
import android.text.SpannableStringBuilder
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import com.aliucord.Utils
import com.aliucord.api.CommandsAPI
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.tr
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.discord.api.message.MessageTypes
import com.discord.models.message.Message
import com.discord.models.user.CoreUser
import com.discord.stores.StoreStream
import com.discord.utilities.color.ColorCompat
import com.discord.widgets.chat.list.WidgetChatList
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.commandscommon.Options
import com.endcord.plugins.translatecommon.GoogleTranslate
import com.endcord.plugins.translatecommon.Languages
import com.lytefast.flexinput.R
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.regex.Pattern

/**
 * Translates messages with the free Google Translate endpoint Endcord PC uses. A translation is shown under the
 * original message, with the detected language, until the user picks "Show original". Also covers Endcord PC's
 * MessageTranslate (automatic translation of incoming messages) and the Google part of Translate+.
 */
internal class Translate : EndcordPlugin(
    name = "Translate",
    description = DESCRIPTION,
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            key = "target",
            label = "Translate messages to",
            options = Languages.options(PluginSetting.Choice.Option(DEVICE, "Device language")),
            default = DEVICE,
        ),
        PluginSetting.Switch(
            key = "autoTranslate",
            label = "Translate incoming messages automatically",
            description = "Messages in another language get their translation shown under them as they appear",
        ),
        PluginSetting.Number(
            key = "minConfidence",
            label = "Minimum detection confidence",
            description = "In percent. Messages whose language Google is less sure about are not translated automatically",
            default = 80,
            min = 0,
            max = 100,
        ),
        PluginSetting.Switch(
            key = "skipOwn",
            label = "Don't translate your own messages automatically",
            default = true,
        ),
        PluginSetting.Switch(
            key = "skipBots",
            label = "Don't translate bot messages automatically",
        ),
        PluginSetting.Text(
            key = "ignored",
            label = "Never translate automatically in",
            description = "Server, channel or user IDs, separated by commas",
            multiline = true,
        ),
        PluginSetting.Choice(
            key = "sentTarget",
            label = "Translate your messages to",
            description = "Used by /translate when you don't pick a language",
            options = Languages.options(),
            default = "en",
        ),
        PluginSetting.Action(
            key = "clearCache",
            label = "Clear translation cache",
        ) {
            clearCache()
            Utils.showToast(tr("Translation cache cleared"))
        },
    )

    /** A finished request for one message. [skipped] ones are kept so auto-translation doesn't retry them. */
    private class Translation(val original: String, val text: String, val source: String, val skipped: Boolean)

    private val cache = object : LinkedHashMap<Long, Translation>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Long, Translation>?) = size > CACHE_SIZE
    }

    /** Messages the user translated by hand. */
    private val shown: MutableSet<Long> = ConcurrentHashMap.newKeySet()

    /** Auto-translated messages the user switched back to the original. */
    private val hidden: MutableSet<Long> = ConcurrentHashMap.newKeySet()
    private val pending: MutableSet<Long> = ConcurrentHashMap.newKeySet()

    @Volatile
    private var executor: ExecutorService? = null

    @Volatile
    private var rateLimitedUntil = 0L

    override fun start(context: Context) {
        // shutdownNow in stop drops queued tasks without running their cleanup, so start from a clean slate
        clearCache()
        executor = Executors.newFixedThreadPool(2)

        MessageActions.register(name, "Translate", R.e.ic_locale_24dp, visible = { ctx ->
            val msg = ctx.message
            !msg.content.isNullOrBlank() && !isVisible(msg)
        }) { ctx -> translateByHand(ctx.message) }

        MessageActions.register(name, "Show original", R.e.ic_locale_24dp, visible = { ctx -> isVisible(ctx.message) }) { ctx ->
            val id = ctx.message.id
            shown.remove(id)
            hidden.add(id)
            refresh(id)
        }

        ChatHooks.register(Decorator())

        // Endcord PC translates what you send from its chat bar button. The shared send pipeline
        // (OutgoingMessages) can't wait for a network request, so on mobile this is a command instead.
        commands.registerCommand(
            "translate",
            "Translate text and send it",
            listOf(
                Options.string("text", "What to translate", true),
                Options.string("to", "Language code to translate to, like en, fr or ja"),
                Options.bool("send", "Send the translation (on by default), or only show it to you"),
            ),
        ) { ctx ->
            val text = ctx.getRequiredString("text")
            val to = ctx.getString("to")?.trim()?.takeIf { it.isNotEmpty() }?.let { matchLanguage(it) }
                ?: choice("sentTarget").ifEmpty { "en" }
            val send = ctx.getBool("send") ?: true
            try {
                val res = GoogleTranslate.translate(text, "auto", to)
                val translated = res.text.trim().ifEmpty { text }
                CommandsAPI.CommandResult(translated, null, send)
            } catch (e: Throwable) {
                if (e is GoogleTranslate.HttpError && e.status == 429) rateLimitedUntil = System.currentTimeMillis() + RATE_LIMIT_PAUSE_MS
                CommandsAPI.CommandResult(tr("Couldn't translate your message: {reason}", "reason" to GoogleTranslate.describe(e)), null, false)
            }
        }
    }

    /** Accepts a language code in any case, or an English language name. */
    private fun matchLanguage(input: String): String {
        Languages.names.keys.firstOrNull { it.equals(input, true) }?.let { return it }
        Languages.names.entries.firstOrNull { it.value.equals(input, true) }?.let { return it.key }
        return input
    }

    override fun stop(context: Context) {
        super.stop(context)
        executor?.shutdownNow()
        executor = null
        clearCache()
    }

    private fun clearCache() {
        synchronized(cache) { cache.clear() }
        shown.clear()
        hidden.clear()
        pending.clear()
    }

    private fun cached(id: Long): Translation? = synchronized(cache) { cache[id] }
    private fun store(id: Long, t: Translation) = synchronized(cache) { cache[id] = t }

    private fun targetLanguage(): String = choice("target").let { if (it == DEVICE || it.isEmpty()) GoogleTranslate.deviceLanguage() else it }

    /** The translation shown under [message] right now, or null. */
    private fun visibleTranslation(message: Message): Translation? {
        val t = cached(message.id) ?: return null
        if (t.skipped || t.original != message.content) return null
        val id = message.id
        return if (shown.contains(id) || (bool("autoTranslate") && !hidden.contains(id))) t else null
    }

    private fun isVisible(message: Message) = visibleTranslation(message) != null

    private fun indicator(t: Translation) = "(" + tr("Translated from {language}", "language" to tr(Languages.name(t.source))) + ")"

    private inner class Decorator : ChatDecorator(name, 100) {
        override fun transformContent(entry: MessageEntry, content: String): String {
            val message = entry.message
            val raw = message.content
            if (raw.isNullOrBlank()) return content
            val t = cached(message.id)
            if (t != null && t.original != raw) {
                // Edited since it was translated
                synchronized(cache) { cache.remove(message.id) }
                shown.remove(message.id)
            }
            if (t == null || t.original != raw) {
                if (bool("autoTranslate") && shouldAutoTranslate(message, raw)) request(message, raw, false)
                return content
            }
            val visible = visibleTranslation(message) ?: return content
            return content + "\n" + visible.text + "\n" + indicator(visible)
        }

        override fun decorateText(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, text: SpannableStringBuilder) {
            val t = visibleTranslation(entry.message) ?: return
            val label = indicator(t)
            val start = text.toString().lastIndexOf(label)
            if (start < 0) return
            val end = start + label.length
            text.setSpan(RelativeSizeSpan(0.8f), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            val color = ColorCompat.getThemedColor(holder.itemView.context, R.b.colorTextMuted)
            text.setSpan(ForegroundColorSpan(color), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
    }

    private fun shouldAutoTranslate(message: Message, raw: String): Boolean {
        if (System.currentTimeMillis() < rateLimitedUntil || pending.contains(message.id)) return false
        if (message.isLocal || message.id <= 0) return false
        val type = message.type
        if (type != null && type != MessageTypes.DEFAULT && type != MessageTypes.REPLY) return false
        val author = message.author ?: return false
        if (bool("skipOwn") && author.id == StoreStream.getUsers().me?.id) return false
        if (bool("skipBots") && CoreUser(author).isBot) return false

        val ignored = list("ignored")
        if (ignored.isNotEmpty()) {
            val guildId = StoreStream.getChannels().getChannel(message.channelId)?.guildId ?: 0L
            if (ignored.any { it == message.channelId.toString() || it == author.id.toString() || (guildId != 0L && it == guildId.toString()) }) {
                return false
            }
        }
        // Links, mentions and custom emojis alone don't need translating
        return LETTER.matcher(NOT_TEXT.matcher(raw).replaceAll(" ")).find()
    }

    private fun translateByHand(message: Message) {
        val id = message.id
        val t = cached(id)
        if (t != null && !t.skipped && t.original == message.content) {
            hidden.remove(id)
            shown.add(id)
            refresh(id)
            return
        }
        Utils.showToast(tr("Translating..."))
        request(message, message.content ?: return, true)
    }

    private fun request(message: Message, raw: String, manual: Boolean) {
        val id = message.id
        if (!pending.add(id)) return
        val target = targetLanguage()
        val minConfidence = int("minConfidence") / 100.0
        val pool = executor
        if (pool == null) {
            pending.remove(id)
            return
        }
        try {
            pool.execute {
                try {
                    val res = GoogleTranslate.translate(raw, "auto", target)
                    val text = res.text.trim()
                    val sameLanguage = baseLanguage(res.sourceLanguage) == baseLanguage(target)
                    val unchanged = text.isEmpty() || text == raw.trim()
                    if (manual) {
                        if (unchanged || sameLanguage) {
                            store(id, Translation(raw, text, res.sourceLanguage, true))
                            Utils.showToast(tr("This message is already in {language}", "language" to tr(Languages.name(res.sourceLanguage))))
                        } else {
                            store(id, Translation(raw, text, res.sourceLanguage, false))
                            hidden.remove(id)
                            shown.add(id)
                            refresh(id)
                        }
                    } else {
                        val skipped = unchanged || sameLanguage || res.confidence < minConfidence
                        store(id, Translation(raw, text, res.sourceLanguage, skipped))
                        if (!skipped) refresh(id)
                    }
                } catch (e: Throwable) {
                    if (e is GoogleTranslate.HttpError && e.status == 429) {
                        rateLimitedUntil = System.currentTimeMillis() + RATE_LIMIT_PAUSE_MS
                    }
                    if (manual) {
                        Utils.showToast(tr("Couldn't translate this message: {reason}", "reason" to GoogleTranslate.describe(e)), true)
                    } else {
                        logger.warn("Auto-translation failed: ${GoogleTranslate.describe(e)}")
                        // Don't retry this message on every bind; editing it or clearing the cache tries again
                        if (e !is GoogleTranslate.HttpError || e.status != 429) store(id, Translation(raw, "", "", true))
                    }
                } finally {
                    pending.remove(id)
                }
            }
        } catch (e: Throwable) {
            // The pool was shut down because the plugin stopped
            pending.remove(id)
        }
    }

    /** Rebinds the row of [messageId] in the open chat, so its translation shows or goes away. */
    private fun refresh(messageId: Long) {
        Utils.mainThread.post {
            try {
                val chat = Utils.widgetChatList ?: return@post
                val adapter = WidgetChatList.`access$getAdapter$p`(chat) ?: return@post
                val data = adapter.internalData
                for (i in data.indices) {
                    val entry = data[i]
                    if (entry is MessageEntry && entry.message.id == messageId) adapter.notifyItemChanged(i)
                }
            } catch (e: Throwable) {
                logger.error("Failed to refresh a translated message", e)
            }
        }
    }

    private companion object {
        const val DESCRIPTION = "Translate messages with Google Translate."
        const val DEVICE = "device"
        const val CACHE_SIZE = 500
        const val RATE_LIMIT_PAUSE_MS = 60_000L

        val NOT_TEXT: Pattern = Pattern.compile("<a?:\\w+:\\d+>|<[@#][!&]?\\d+>|<t:\\d+(?::\\w)?>|https?://\\S+|:\\w+:|`[^`]*`")
        val LETTER: Pattern = Pattern.compile("\\p{L}{2,}")

        fun baseLanguage(code: String) = code.substringBefore('-').lowercase()
    }
}
