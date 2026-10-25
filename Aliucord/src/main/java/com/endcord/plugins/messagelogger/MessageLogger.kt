/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagelogger

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.view.View
import android.widget.TextView
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.tr
import com.aliucord.patcher.after
import com.aliucord.patcher.before
import com.aliucord.utils.ChannelUtils
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.ChannelWrapper.Companion.isDM
import com.aliucord.wrappers.ChannelWrapper.Companion.parentId
import com.discord.api.message.Message as ApiMessage
import com.discord.models.message.Message
import com.discord.stores.StoreMessagesHolder
import com.discord.stores.StoreStream
import com.discord.utilities.color.ColorCompat
import com.discord.widgets.chat.list.adapter.WidgetChatListItem
import com.discord.widgets.chat.list.entries.AttachmentEntry
import com.discord.widgets.chat.list.entries.ChatListEntry
import com.discord.widgets.chat.list.entries.EmbedEntry
import com.discord.widgets.chat.list.entries.StickerEntry
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.messagesacommon.ChatListFilter
import com.endcord.plugins.messagesacommon.MessageRenderHooks
import com.endcord.plugins.messagesacommon.MessageStoreAccess
import com.facebook.drawee.span.DraweeSpanStringBuilder
import com.lytefast.flexinput.R
import de.robv.android.xposed.XC_MethodHook
import java.util.WeakHashMap

internal class MessageLogger : EndcordPlugin(
    name = "MessageLogger",
    description = "Temporarily logs deleted and edited messages.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            key = "deleteStyle",
            label = "Delete Style",
            description = "The style of deleted messages",
            options = listOf(
                PluginSetting.Choice.Option("text", "Red text"),
                PluginSetting.Choice.Option("overlay", "Red overlay"),
            ),
        ),
        PluginSetting.Switch("logDeletes", "Log Deletes", "Whether to log deleted messages", default = true),
        PluginSetting.Switch("logEdits", "Log Edits", "Whether to log edited messages", default = true),
        PluginSetting.Switch("inlineEdits", "Inline Edits", "Whether to display edit history as part of message content", default = true),
        PluginSetting.Switch("ghostPings", "Ghost Ping Alerts", "Show a notice when a message that mentioned you is deleted", default = true),
        PluginSetting.Switch("ignoreBots", "Ignore Bots", "Whether to ignore messages by bots"),
        PluginSetting.Switch("ignoreSelf", "Ignore Self", "Whether to ignore messages by yourself"),
        PluginSetting.Text("ignoreUsers", "Ignore Users", "Comma-separated list of user IDs to ignore", multiline = true),
        PluginSetting.Text("ignoreChannels", "Ignore Channels", "Comma-separated list of channel IDs to ignore", multiline = true),
        PluginSetting.Text("ignoreGuilds", "Ignore Guilds", "Comma-separated list of guild IDs to ignore", multiline = true),
        PluginSetting.Number(
            key = "logLimit",
            label = "Log Size",
            description = "How many deleted and edited messages are kept in memory",
            default = 500,
            min = 50,
            max = 5000,
        ),
        PluginSetting.Action("openLogs", "Open Logs", "Every deleted and edited message logged since Discord was opened") { ctx ->
            Utils.openPageWithProxy(ctx, MessageLogPage())
        },
        PluginSetting.Action("clearLogs", "Clear Logs", "Forget the log and remove deleted messages from the chat") {
            clearEverything()
            Utils.showToast(tr("Message log cleared"))
        },
    )

    /** The cached message an update is about to replace, from before to after the update. */
    private val previous = ThreadLocal<Message?>()

    /** Text views whose color we changed, with the color to restore. */
    private val recolored = WeakHashMap<TextView, ColorStateList>()

    /** Item views we turned grey. */
    private val greyed = WeakHashMap<View, Boolean>()

    private val greyPaint by lazy {
        Paint().apply { colorFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(0f) }) }
    }

    override fun start(context: Context) {
        MessageLog.limit = int("logLimit")
        patchDeletes()
        patchEdits()
        patchItems()
        MessageRenderHooks.register(name, renderHandler)

        MessageActions.register(
            name,
            "Message Edit History",
            R.e.ic_history_white_24dp,
            visible = { MessageLog.hasEdits(it.message.id) },
        ) {
            Utils.openPageWithProxy(it.sheet.requireContext(), EditHistoryPage(it.message.id, it.message.content ?: ""))
        }
        MessageActions.register(
            name,
            "Remove Message History",
            R.e.ic_delete_24dp,
            visible = { MessageLog.isDeleted(it.message) || MessageLog.hasEdits(it.message.id) },
        ) {
            removeHistory(it.message)
        }
    }

    override fun stop(context: Context) {
        MessageRenderHooks.unregisterAll(name)
        super.stop(context)
        // Without the hooks the logged state can't be shown, so forget it and drop deleted messages
        clearEverything()
        for ((view, color) in recolored) view.setTextColor(color)
        recolored.clear()
        for (view in greyed.keys) view.setLayerType(View.LAYER_TYPE_NONE, null)
        greyed.clear()
    }

    // region Logging

    private fun myId(): Long = try {
        StoreStream.getUsers().me.id
    } catch (_: Throwable) {
        0L
    }

    /** Mirrors Endcord PC's ignore rules. */
    private fun shouldIgnore(message: Message, isEdit: Boolean): Boolean {
        if (isEdit && !bool("logEdits")) return true
        if (!isEdit && !bool("logDeletes")) return true
        // Ephemeral messages ("only you can see this") always vanish
        if (message.isEphemeralMessage) return true

        val author = message.author
        // api User.e() is the bot flag
        if (bool("ignoreBots") && author?.e() == true) return true
        if (bool("ignoreSelf") && author != null && author.id == myId()) return true
        if (author != null && author.id.toString() in list("ignoreUsers")) return true

        val ignoredChannels = list("ignoreChannels")
        if (message.channelId.toString() in ignoredChannels) return true
        val channel = StoreStream.getChannels().getChannel(message.channelId)
        if (channel != null && channel.parentId != 0L && channel.parentId.toString() in ignoredChannels) return true

        val guildId = message.guildId ?: channel?.guildId ?: 0L
        if (guildId != 0L && guildId.toString() in list("ignoreGuilds")) return true
        return false
    }

    private fun mentionsMe(message: Message): Boolean {
        val me = myId()
        if (me == 0L || message.author?.id == me) return false
        if (message.mentionEveryone == true) return true
        return message.mentions?.any { it.id == me } == true
    }

    private fun logEntry(kind: MessageLog.Kind, message: Message, newContent: String?) {
        MessageLog.limit = int("logLimit")
        MessageLog.add(
            MessageLog.Entry(
                kind = kind,
                messageId = message.id,
                channelId = message.channelId,
                guildId = message.guildId ?: 0L,
                authorName = message.author?.username ?: "?",
                content = message.content ?: "",
                newContent = newContent,
                attachments = message.attachments?.size ?: 0,
                loggedAt = System.currentTimeMillis(),
            )
        )
    }

    private fun ghostPingNotice(message: Message) {
        val channel = StoreStream.getChannels().getChannel(message.channelId)
        val user = message.author?.username ?: "?"
        Utils.mainThread.post {
            val text = if (channel == null || channel.isDM()) {
                tr("Ghost ping from {user} in your DMs", "user" to user)
            } else {
                tr("Ghost ping from {user} in {channel}", "user" to user, "channel" to ChannelUtils.getDisplayName(channel))
            }
            Utils.showToast(text, true)
        }
    }

    /** Keeps deleted messages in the cache, marked as deleted, instead of removing them. */
    private fun patchDeletes() {
        patcher.before<StoreMessagesHolder>("deleteMessages", Long::class.javaPrimitiveType!!, List::class.java) { param ->
            val channelId = param.args[0] as Long
            @Suppress("UNCHECKED_CAST")
            val ids = param.args[1] as? List<Long> ?: return@before
            if (ids.isEmpty() || !bool("logDeletes")) return@before

            val remove = ArrayList<Long>(ids.size)
            val logged = ArrayList<Message>()
            synchronized(this) {
                val messages = MessageStoreAccess.channelMessages(this, channelId) ?: return@before
                for (id in ids) {
                    val message = messages[id]
                    // Deleting an already deleted message removes it for real, that's how history is removed
                    if (message == null || MessageLog.isDeleted(message) || shouldIgnore(message, false)) {
                        remove += id
                        continue
                    }
                    messages[id] = MessageLog.markDeleted(message)
                    logged += message
                }
                if (logged.isNotEmpty()) {
                    MessageStoreAccess.markUpdated(this, channelId)
                    // The original only publishes when it removed something
                    if (remove.isEmpty()) MessageStoreAccess.publish(this)
                }
            }
            param.args[1] = remove

            if (logged.isEmpty()) return@before
            val notify = bool("ghostPings")
            for (message in logged) {
                val ghostPing = mentionsMe(message)
                logEntry(if (ghostPing) MessageLog.Kind.GHOST_PING else MessageLog.Kind.DELETED, message, null)
                if (ghostPing && notify) ghostPingNotice(message)
            }
        }
    }

    /** Remembers the previous content of edited messages, and keeps deleted messages marked when they update. */
    private fun patchEdits() {
        val update = StoreMessagesHolder::class.java.getDeclaredMethod("updateMessages", ApiMessage::class.java)
        patcher.patch(update, object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                previous.set(null)
                try {
                    val holder = param.thisObject as StoreMessagesHolder
                    val incoming = param.args[0] as ApiMessage? ?: return
                    // api Message: g() is the channel id, o() the message id, i() the content, j() the edit time
                    val old = synchronized(holder) {
                        MessageStoreAccess.channelMessages(holder, incoming.g())?.get(incoming.o())
                    } ?: return
                    previous.set(old)

                    val newContent = incoming.i() ?: return
                    val editedAt = incoming.j() ?: return
                    val oldContent = old.content ?: ""
                    if (newContent == oldContent || shouldIgnore(old, true)) return

                    MessageLog.limit = int("logLimit")
                    MessageLog.addEdit(old.id, MessageLog.Edit(editedAt.g(), oldContent))
                    logEntry(MessageLog.Kind.EDITED, old, newContent)
                } catch (e: Throwable) {
                    logger.error("Failed to log an edit", e)
                }
            }

            override fun afterHookedMethod(param: MethodHookParam) {
                try {
                    val old = previous.get() ?: return
                    previous.set(null)
                    if (!MessageLog.isDeleted(old)) return
                    val holder = param.thisObject as StoreMessagesHolder
                    synchronized(holder) {
                        val messages = MessageStoreAccess.channelMessages(holder, old.channelId) ?: return
                        val now = messages[old.id] ?: return
                        if (MessageLog.isDeleted(now)) return
                        messages[old.id] = MessageLog.markDeleted(now)
                        MessageStoreAccess.markUpdated(holder, old.channelId)
                        MessageStoreAccess.publish(holder)
                    }
                } catch (e: Throwable) {
                    logger.error("Failed to keep a deleted message marked", e)
                }
            }
        })
    }

    // endregion

    // region Rendering

    private val renderHandler = object : MessageRenderHooks.Handler {
        override fun afterParse(render: MessageRenderHooks.Render, text: DraweeSpanStringBuilder) {
            val message = render.message
            val ctx = render.textView.context

            if (bool("inlineEdits")) {
                val edits = MessageLog.editsOf(message.id)
                if (!edits.isNullOrEmpty()) {
                    val muted = ColorCompat.getThemedColor(ctx, R.b.colorTextMuted)
                    val history = SpannableStringBuilder()
                    for (edit in edits) {
                        val start = history.length
                        // Parsing as edited adds Discord's own "(edited)" tag to every old version
                        history.append(render.parse(edit.content, true) ?: edit.content)
                        history.setSpan(ForegroundColorSpan(muted), start, history.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                        history.append('\n')
                    }
                    text.insert(0, history)
                }
            }

            if (MessageLog.isDeleted(message)) {
                if (text.isNotEmpty()) text.append(' ')
                val start = text.length
                text.append(tr("(deleted)"))
                val danger = ColorCompat.getThemedColor(ctx, R.b.colorTextDanger)
                text.setSpan(ForegroundColorSpan(danger), start, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                text.setSpan(RelativeSizeSpan(0.75f), start, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        }

        override fun afterBind(render: MessageRenderHooks.Render) {
            val view = render.textView
            val red = MessageLog.isDeleted(render.message) && choice("deleteStyle") == "text"
            if (red) {
                if (!recolored.containsKey(view)) recolored[view] = view.textColors
                view.setTextColor(ColorCompat.getThemedColor(view.context, R.b.colorTextDanger))
            } else {
                recolored.remove(view)?.let { view.setTextColor(it) }
            }
        }
    }

    /** Tints deleted messages for the overlay style and turns the media of deleted messages grey. */
    private fun patchItems() {
        patcher.after<WidgetChatListItem>("onConfigure", Int::class.javaPrimitiveType!!, ChatListEntry::class.java) { param ->
            try {
                val entry = param.args[1] as ChatListEntry? ?: return@after
                val message = ChatListFilter.messageOf(entry)
                val deleted = message != null && MessageLog.isDeleted(message)
                val view = itemView

                if (deleted && choice("deleteStyle") == "overlay") {
                    // Same tint as Endcord PC: red at 15%
                    view.setBackgroundColor(0x26F04747)
                }

                val grey = deleted && (entry is AttachmentEntry || entry is EmbedEntry || entry is StickerEntry)
                if (grey && greyed[view] != true) {
                    view.setLayerType(View.LAYER_TYPE_HARDWARE, greyPaint)
                    greyed[view] = true
                } else if (!grey && greyed.remove(view) != null) {
                    view.setLayerType(View.LAYER_TYPE_NONE, null)
                }
            } catch (e: Throwable) {
                logger.error("Failed to style a logged message", e)
            }
        }
    }

    // endregion

    // region Actions

    /** Removes a deleted message for good, or forgets the edit history of a message. */
    private fun removeHistory(message: Message) {
        MessageLog.clearEdits(message.id)
        if (!MessageLog.isDeleted(message)) {
            // Only the drawing changes, the message itself is the same
            ChatListFilter.redrawVisible()
            return
        }
        Utils.threadPool.execute {
            try {
                // Marked messages are removed for real when they are deleted again
                MessageStoreAccess.holder.deleteMessages(message.channelId, listOf(message.id))
            } catch (e: Throwable) {
                logger.error("Failed to remove message history", e)
            }
        }
    }

    private fun clearEverything() {
        MessageLog.clear()
        ChatListFilter.redrawVisible()
        Utils.threadPool.execute {
            try {
                val holder = MessageStoreAccess.holder
                synchronized(holder) {
                    for ((channelId, messages) in MessageStoreAccess.cachedChannels(holder)) {
                        val iterator = messages.values.iterator()
                        var changed = false
                        while (iterator.hasNext()) {
                            if (MessageLog.isDeleted(iterator.next())) {
                                iterator.remove()
                                changed = true
                            }
                        }
                        if (changed) MessageStoreAccess.markUpdated(holder, channelId)
                    }
                    MessageStoreAccess.publish(holder)
                }
            } catch (e: Throwable) {
                logger.error("Failed to clear logged messages", e)
            }
        }
    }

    // endregion
}
