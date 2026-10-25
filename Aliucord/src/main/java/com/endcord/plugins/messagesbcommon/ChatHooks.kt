/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagesbcommon

import android.content.Context
import android.text.SpannableStringBuilder
import android.widget.TextView
import com.aliucord.Logger
import com.aliucord.api.PatcherAPI
import com.aliucord.patcher.after
import com.aliucord.patcher.before
import com.discord.stores.StoreMessageReplies
import com.discord.utilities.textprocessing.DiscordParser
import com.discord.utilities.textprocessing.MessagePreprocessor
import com.discord.utilities.textprocessing.MessageRenderContext
import com.discord.utilities.view.text.SimpleDraweeSpanTextView
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.ChatListEntry
import com.discord.widgets.chat.list.entries.MessageEntry
import de.robv.android.xposed.XC_MethodHook
import java.lang.reflect.Field

/**
 * One plugin's contribution to how a message is rendered in the chat list. Every method runs while the chat
 * list binds a row, so implementations must return quickly and allocate nothing when they don't apply.
 * All methods run on the main thread.
 */
internal abstract class ChatDecorator(
    /** Name of the plugin that registered this decorator. */
    @JvmField val owner: String,
    /** Lower runs first. Text replacements should use a low value, appended content a high one. */
    @JvmField val priority: Int = 0,
) {
    /** Rewrites the raw markdown of a message before Discord parses it. Return [content] when unchanged. */
    open fun transformContent(entry: MessageEntry, content: String): String = content

    /** Edits the rendered message text in place, before it is shown. */
    open fun decorateText(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, text: SpannableStringBuilder) {}

    /** Replaces the text of the timestamp next to the author name. The first non-null result wins. */
    open fun formatTimestamp(entry: MessageEntry, millis: Long, view: TextView): CharSequence? = null

    /** Something to append after the timestamp next to the author name, or null. */
    open fun timestampSuffix(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, view: TextView): CharSequence? = null

    /** Replaces the author name. [nick] is what Discord shows. The first non-null result wins. */
    open fun formatAuthorName(entry: MessageEntry, nick: String, view: TextView): CharSequence? = null

    /**
     * Replaces the author name of the replied-to message in a reply preview, without the leading `@`.
     * The first non-null result wins.
     */
    open fun formatReplyName(entry: MessageEntry, replied: MessageEntry, name: String, view: TextView): CharSequence? = null

    /** Something to append after the author name of a reply preview, or null. */
    open fun replyNameSuffix(entry: MessageEntry, replied: MessageEntry, view: TextView): CharSequence? = null

    /** Runs after the whole row has been configured. */
    open fun afterConfigure(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry) {}
}

/**
 * Shared hooks on the chat list's message rows, so the plugins of this batch that change how messages render
 * patch `WidgetChatListAdapterItemMessage` once instead of each on their own. The hooks are installed when the
 * first decorator registers and removed when the last one leaves.
 */
internal object ChatHooks {
    private val logger = Logger("ChatHooks")

    @Volatile
    private var decorators: Array<ChatDecorator> = emptyArray()
    private var patcher: PatcherAPI? = null

    // The row being configured, for hooks on methods that onConfigure calls (all on the main thread)
    private var configEntry: MessageEntry? = null

    // The row whose main text is being parsed right now
    private var textHolder: WidgetChatListAdapterItemMessage? = null
    private var textEntry: MessageEntry? = null

    private val fItemName: Field by lazy { field("itemName") }
    private val fItemTimestamp: Field by lazy { field("itemTimestamp") }
    private val fReplyName: Field by lazy { field("replyName") }

    private fun field(name: String): Field =
        WidgetChatListAdapterItemMessage::class.java.getDeclaredField(name).apply { isAccessible = true }

    @Synchronized
    fun register(decorator: ChatDecorator) {
        val list = decorators.filter { it !== decorator }.toMutableList()
        list += decorator
        decorators = list.sortedBy { it.priority }.toTypedArray()
        if (patcher == null) install()
    }

    @Synchronized
    fun unregisterAll(owner: String) {
        decorators = decorators.filter { it.owner != owner }.toTypedArray()
        if (decorators.isEmpty()) {
            patcher?.unpatchAll()
            patcher = null
            configEntry = null
            textHolder = null
            textEntry = null
        }
    }

    private inline fun <T> safe(decorator: ChatDecorator, block: () -> T): T? = try {
        block()
    } catch (e: Throwable) {
        logger.error("${decorator.owner} failed while rendering a message", e)
        null
    }

    private fun install() {
        val p = PatcherAPI(logger)
        patcher = p
        val int = Int::class.javaPrimitiveType!!
        val bool = Boolean::class.javaPrimitiveType!!

        p.before<WidgetChatListAdapterItemMessage>("onConfigure", int, ChatListEntry::class.java) { param ->
            configEntry = param.args[1] as? MessageEntry
        }
        p.after<WidgetChatListAdapterItemMessage>("onConfigure", int, ChatListEntry::class.java) { param ->
            val entry = configEntry
            configEntry = null
            if (entry != null && param.throwable == null) afterConfigure(this, entry)
        }

        p.before<WidgetChatListAdapterItemMessage>(
            "processMessageText",
            SimpleDraweeSpanTextView::class.java,
            MessageEntry::class.java,
        ) { param ->
            textHolder = this
            textEntry = param.args[1] as? MessageEntry
        }
        p.after<WidgetChatListAdapterItemMessage>(
            "processMessageText",
            SimpleDraweeSpanTextView::class.java,
            MessageEntry::class.java,
        ) {
            textHolder = null
            textEntry = null
        }

        // Static, so patched directly: the patcher.before/after helpers expect an instance
        p.patch(
            DiscordParser::class.java.getDeclaredMethod(
                "parseChannelMessage",
                Context::class.java,
                String::class.java,
                MessageRenderContext::class.java,
                MessagePreprocessor::class.java,
                DiscordParser.ParserOptions::class.java,
                bool,
            ),
            object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam) {
                    val entry = textEntry ?: return
                    try {
                        val original = param.args[1] as String? ?: return
                        var content = original
                        for (d in decorators) content = safe(d) { d.transformContent(entry, content) } ?: content
                        if (content !== original) param.args[1] = content
                    } catch (e: Throwable) {
                        logger.error("Failed to transform message content", e)
                    }
                }

                override fun afterHookedMethod(param: MethodHookParam) {
                    val entry = textEntry ?: return
                    val holder = textHolder ?: return
                    try {
                        val text = param.result as? SpannableStringBuilder ?: return
                        for (d in decorators) safe(d) { d.decorateText(holder, entry, text) }
                    } catch (e: Throwable) {
                        logger.error("Failed to decorate message text", e)
                    }
                }
            },
        )

        // configureReplyName runs before the reply preview measures the name to indent the reply text,
        // so the name has to be final here and not later in configureReplyPreview
        p.after<WidgetChatListAdapterItemMessage>("configureReplyName", String::class.java, int, bool) { param ->
            val entry = configEntry ?: return@after
            val name = param.args[0] as String?
            if (name.isNullOrEmpty() || entry.message.isInteraction) return@after
            val replyData = entry.replyData ?: return@after
            if (replyData.messageState !is StoreMessageReplies.MessageState.Loaded) return@after
            val replied = replyData.messageEntry ?: return@after
            val view = fReplyName[this] as TextView? ?: return@after
            configureReplyName(view, entry, replied, name, param.args[2] as Boolean)
        }
    }

    private fun configureReplyName(view: TextView, entry: MessageEntry, replied: MessageEntry, name: String, mention: Boolean) {
        val list = decorators
        var formatted: CharSequence? = null
        for (d in list) {
            formatted = safe(d) { d.formatReplyName(entry, replied, name, view) }
            if (formatted != null) break
        }
        var builder: SpannableStringBuilder? = null
        for (d in list) {
            val suffix = safe(d) { d.replyNameSuffix(entry, replied, view) } ?: continue
            if (builder == null) builder = SpannableStringBuilder(if (mention) "@" else "").append(formatted ?: name)
            builder.append(suffix)
        }
        when {
            builder != null -> view.text = builder
            formatted != null -> view.text = SpannableStringBuilder(if (mention) "@" else "").append(formatted)
        }
    }

    private fun afterConfigure(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry) {
        val list = decorators
        if (list.isEmpty()) return

        val nameView = fItemName[holder] as TextView?
        if (nameView != null) {
            val authorId = entry.message.author?.id
            val nick = (if (authorId != null) entry.nickOrUsernames[authorId] else null) ?: nameView.text?.toString()
            if (nick != null) for (d in list) {
                val res = safe(d) { d.formatAuthorName(entry, nick, nameView) } ?: continue
                nameView.text = res
                break
            }
        }

        val timestampView = fItemTimestamp[holder] as TextView?
        if (timestampView != null) {
            val millis = entry.message.timestamp?.g() ?: 0L
            var base: CharSequence? = null
            if (millis > 0) for (d in list) {
                base = safe(d) { d.formatTimestamp(entry, millis, timestampView) }
                if (base != null) break
            }
            var builder: SpannableStringBuilder? = null
            for (d in list) {
                val suffix = safe(d) { d.timestampSuffix(holder, entry, timestampView) } ?: continue
                if (builder == null) builder = SpannableStringBuilder(base ?: timestampView.text ?: "")
                builder.append(suffix)
            }
            when {
                builder != null -> timestampView.text = builder
                base != null -> timestampView.text = base
            }
        }

        for (d in list) safe(d) { d.afterConfigure(holder, entry) }
    }
}
