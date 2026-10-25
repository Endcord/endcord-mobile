/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.composercommon

import android.content.Context
import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.api.PatcherAPI
import com.aliucord.patcher.after
import com.aliucord.patcher.before
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.discord.api.channel.Channel
import com.discord.models.message.Message
import com.discord.widgets.chat.MessageContent
import com.discord.widgets.chat.MessageManager
import com.discord.widgets.chat.input.ChatInputViewModel
import com.discord.widgets.chat.input.`WidgetChatInput$configureSendListeners$2`
import com.discord.widgets.chat.input.models.ApplicationCommandData
import com.lytefast.flexinput.model.Attachment
import java.util.concurrent.CopyOnWriteArrayList

/**
 * A message that is about to leave the chat input. Hooks registered with [OutgoingMessages] receive it in
 * order and may change [content] or [cancel] the send.
 */
internal class OutgoingMessage(
    /** The channel the message goes to. */
    @JvmField val channelId: Long,
    @JvmField val channel: Channel?,
    /** The message being edited, or null for a new message. */
    @JvmField val editing: Message?,
    /** Files attached to the message. */
    @JvmField val attachments: List<Attachment<*>>,
    /** The reply bar state when replying, otherwise null. */
    @JvmField val reply: ChatInputViewModel.ViewState.Loaded.PendingReplyState.Replying?,
    /**
     * Whether this message creates a thread or a forum post instead of going into [channelId]. Plugins that
     * send, edit or hold back messages themselves should leave these alone.
     */
    @JvmField val startsThread: Boolean,
    /** The message manager of the chat input, for sending follow-up messages. */
    @JvmField val messageManager: MessageManager,
    @JvmField val context: Context,
    content: String,
) {
    /** The text that will be sent. Hooks see the result of the hooks that ran before them. */
    var content: String = content

    val isEdit: Boolean get() = editing != null

    internal var cancelled = false
        private set
    internal var clearInput = false
        private set
    internal val afterSend = ArrayList<() -> Unit>(0)

    /**
     * Stops the message from being sent and skips the remaining hooks.
     *
     * @param clearInput Whether to empty the chat input as if the message was sent. Pass true when the hook
     * handled the message itself (edited a message, scheduled it, ...), false to let the user fix it.
     */
    fun cancel(clearInput: Boolean) {
        cancelled = true
        this.clearInput = clearInput
    }

    /** Runs [block] on the main thread once Discord has taken the (possibly changed) message. Not run when cancelled. */
    fun afterSend(block: () -> Unit) {
        afterSend += block
    }
}

/**
 * One shared hook on the chat input's send path so the composer plugins don't each patch it.
 *
 * Only messages the user typed and sent (or edited) from the chat input go through the hooks:
 * slash commands, the output of Aliucord commands and Discord's built-in commands (/shrug, /me, ...) are
 * sent untouched, so command text is never rewritten. Edits only reach hooks registered with `onEdit`,
 * like on Endcord PC where edits have their own listener.
 */
internal object OutgoingMessages {
    /** Ordering of the hooks, lowest first. */
    object Priority {
        /** Messages that are really actions (`s/a/b`, `+:emoji:`), handled before anything rewrites them. */
        const val ACTION = 0
        const val REPLACE = 100
        const val EXPAND = 200
        const val SANITIZE = 300
        const val STYLE = 400
        const val APPEND = 500
        const val ENCRYPT = 600
        /** Hooks that decide how the final text is delivered (schedule, merge, silent, split). */
        const val DELIVERY = 700
    }

    private const val GUILD_FORUM = 15

    private class Hook(
        val owner: String,
        val priority: Int,
        val onSend: Boolean,
        val onEdit: Boolean,
        val handler: (OutgoingMessage) -> Unit,
    )

    private val logger = Logger("OutgoingMessages")
    private val hooks = CopyOnWriteArrayList<Hook>()
    private var patched = false

    /** Set while the chat input sends a typed message, so other callers of sendMessage are left alone. */
    private var userSendPending = false

    /**
     * Registers a hook that runs before a message from the chat input is sent.
     *
     * @param owner Name of the plugin, used by [unregisterAll].
     * @param priority Where to run, see [Priority].
     * @param onSend Whether to run for new messages.
     * @param onEdit Whether to run for edits.
     */
    @JvmStatic
    fun register(owner: String, priority: Int, onSend: Boolean = true, onEdit: Boolean = false, handler: (OutgoingMessage) -> Unit) {
        hooks += Hook(owner, priority, onSend, onEdit, handler)
        ensurePatched()
    }

    /** Removes every hook added by [owner]. */
    @JvmStatic
    fun unregisterAll(owner: String) {
        hooks.removeAll { it.owner == owner }
    }

    @Synchronized
    private fun ensurePatched() {
        if (patched) return
        patched = true
        val patcher = PatcherAPI(logger)

        // The chat input's send listener: a null command means the user sent what they typed.
        // Built-in commands (Discord's and Aliucord's) pass their ApplicationCommandData here.
        patcher.before<`WidgetChatInput$configureSendListeners$2`>(
            "invoke",
            List::class.java,
            ApplicationCommandData::class.java,
            Function1::class.java,
        ) { param -> userSendPending = param.args[1] == null }
        patcher.after<`WidgetChatInput$configureSendListeners$2`>(
            "invoke",
            List::class.java,
            ApplicationCommandData::class.java,
            Function1::class.java,
        ) { userSendPending = false }

        patcher.before<ChatInputViewModel>(
            "sendMessage",
            Context::class.java,
            MessageManager::class.java,
            MessageContent::class.java,
            List::class.java,
            Boolean::class.javaPrimitiveType!!,
            Function1::class.java,
        ) { param ->
            if (!userSendPending || hooks.isEmpty()) return@before
            userSendPending = false
            try {
                handleSend(this, param.args) { param.result = null }
            } catch (e: Throwable) {
                logger.error("Failed to run message hooks", e)
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    private inline fun handleSend(viewModel: ChatInputViewModel, args: Array<Any?>, skipOriginal: () -> Unit) {
        val state = viewModel.viewState as? ChatInputViewModel.ViewState.Loaded ?: return
        val original = args[2] as MessageContent
        val isEdit = state.isEditing && state.editingMessage != null
        val message = OutgoingMessage(
            channelId = state.channelId,
            channel = state.channel,
            editing = if (isEdit) state.editingMessage?.message else null,
            attachments = (args[3] as? List<Attachment<*>>) ?: emptyList(),
            reply = state.pendingReplyState as? ChatInputViewModel.ViewState.Loaded.PendingReplyState.Replying,
            startsThread = state.selectedThreadDraft != null || state.channel?.type == GUILD_FORUM,
            messageManager = args[1] as MessageManager,
            context = args[0] as Context,
            content = original.textContent ?: "",
        )

        for (hook in hooks.sortedBy { it.priority }) {
            if (if (isEdit) !hook.onEdit else !hook.onSend) continue
            try {
                hook.handler(message)
            } catch (e: Throwable) {
                logger.error("${hook.owner}: message hook failed", e)
            }
            if (message.cancelled) break
        }

        if (message.cancelled) {
            skipOriginal()
            (args[5] as? Function1<Boolean, Unit>)?.invoke(message.clearInput)
            return
        }
        if (message.content != original.textContent) {
            args[2] = MessageContent(message.content, original.mentionedUsers)
        }

        // Posted, so it runs once the original sendMessage below has handed the message to Discord
        for (block in message.afterSend) Utils.mainThread.post {
            try {
                block()
            } catch (e: Throwable) {
                logger.error("After send callback failed", e)
            }
        }
    }
}
