/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagesacommon

import android.content.Context
import com.aliucord.Logger
import com.aliucord.api.PatcherAPI
import com.discord.models.message.Message
import com.discord.utilities.textprocessing.DiscordParser
import com.discord.utilities.textprocessing.MessagePreprocessor
import com.discord.utilities.textprocessing.MessageRenderContext
import com.discord.utilities.view.text.SimpleDraweeSpanTextView
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.facebook.drawee.span.DraweeSpanStringBuilder
import de.robv.android.xposed.XC_MethodHook
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Lets the message plugins change how the text of a chat message is rendered, sharing one set of patches.
 *
 * Every time a message is bound, [Handler.beforeParse] may change the markdown that gets parsed and whether the
 * "(edited)" tag is drawn, [Handler.afterParse] may add to the parsed text before it is shown, and
 * [Handler.afterBind] may style the text view. Everything runs on the main thread while the chat renders,
 * so handlers must be fast.
 */
internal object MessageRenderHooks {
    /** The message being rendered. */
    class Render internal constructor(
        @JvmField val message: Message,
        @JvmField val entry: MessageEntry,
        @JvmField val item: WidgetChatListAdapterItemMessage,
        @JvmField val textView: SimpleDraweeSpanTextView,
    ) {
        /** The markdown that is about to be parsed. */
        @JvmField var content: String = ""

        /** Whether the "(edited)" tag is drawn after the text. */
        @JvmField var showEdited: Boolean = false

        internal var started = false
        internal var parsing = false
        private var context: Context? = null
        private var renderContext: MessageRenderContext? = null
        private var preprocessor: MessagePreprocessor? = null
        private var options: DiscordParser.ParserOptions? = null

        internal fun capture(args: Array<Any?>) {
            context = args[0] as Context?
            content = args[1] as String? ?: ""
            renderContext = args[2] as MessageRenderContext?
            preprocessor = args[3] as MessagePreprocessor?
            options = args[4] as DiscordParser.ParserOptions?
            showEdited = args[5] as Boolean? ?: false
        }

        /** Parses more markdown the way the message text is parsed, for example an older version of it. */
        fun parse(markdown: String, edited: Boolean): DraweeSpanStringBuilder? {
            val ctx = context ?: return null
            return DiscordParser.parseChannelMessage(ctx, markdown, renderContext, preprocessor, options, edited)
        }
    }

    interface Handler {
        /** Called before the message text is parsed. Change [Render.content] or [Render.showEdited] here. */
        fun beforeParse(render: Render) {}

        /** Called with the parsed text before it is put into the text view. */
        fun afterParse(render: Render, text: DraweeSpanStringBuilder) {}

        /** Called after the text view was filled. */
        fun afterBind(render: Render) {}
    }

    private class Owned(val owner: String, val handler: Handler)

    private val logger = Logger("MessagesCommon")
    private val handlers = CopyOnWriteArrayList<Owned>()
    private var patched = false

    // Only touched on the main thread, where messages are bound
    private var current: Render? = null

    fun register(owner: String, handler: Handler) {
        handlers += Owned(owner, handler)
        ensurePatched()
    }

    fun unregisterAll(owner: String) {
        handlers.removeAll { it.owner == owner }
    }

    private inline fun each(what: String, block: (Handler) -> Unit) {
        for (owned in handlers) {
            try {
                block(owned.handler)
            } catch (e: Throwable) {
                logger.error("${owned.owner}: $what failed", e)
            }
        }
    }

    @Synchronized
    private fun ensurePatched() {
        if (patched) return
        patched = true
        val patcher = PatcherAPI(logger)

        val processText = WidgetChatListAdapterItemMessage::class.java.getDeclaredMethod(
            "processMessageText",
            SimpleDraweeSpanTextView::class.java,
            MessageEntry::class.java,
        )
        patcher.patch(processText, object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                current = null
                if (handlers.isEmpty()) return
                try {
                    val textView = param.args[0] as SimpleDraweeSpanTextView? ?: return
                    val entry = param.args[1] as MessageEntry? ?: return
                    current = Render(entry.message, entry, param.thisObject as WidgetChatListAdapterItemMessage, textView)
                } catch (e: Throwable) {
                    logger.error("Failed to start rendering a message", e)
                }
            }

            override fun afterHookedMethod(param: MethodHookParam) {
                val render = current ?: return
                current = null
                if (render.started && param.throwable == null) each("afterBind") { it.afterBind(render) }
            }
        })

        val parse = DiscordParser::class.java.getDeclaredMethod(
            "parseChannelMessage",
            Context::class.java,
            String::class.java,
            MessageRenderContext::class.java,
            MessagePreprocessor::class.java,
            DiscordParser.ParserOptions::class.java,
            Boolean::class.javaPrimitiveType!!,
        )
        patcher.patch(parse, object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                val render = current ?: return
                // Only the message text itself, not the extra parses handlers do
                if (render.started) return
                render.started = true
                render.parsing = true
                try {
                    render.capture(param.args)
                    each("beforeParse") { it.beforeParse(render) }
                    param.args[1] = render.content
                    param.args[5] = render.showEdited
                } catch (e: Throwable) {
                    logger.error("Failed to prepare a message for rendering", e)
                }
            }

            override fun afterHookedMethod(param: MethodHookParam) {
                val render = current ?: return
                if (!render.parsing) return
                render.parsing = false
                val text = param.result as? DraweeSpanStringBuilder ?: return
                each("afterParse") { it.afterParse(render, text) }
            }
        })
    }
}
