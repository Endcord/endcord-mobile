/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.clientsideblock

import android.content.Context
import android.text.Spanned
import android.text.style.StyleSpan
import android.view.View
import android.widget.ImageView
import android.widget.TextView
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.tr
import com.aliucord.patcher.after
import com.aliucord.utils.RxUtils.subscribe
import com.discord.stores.StoreStream
import com.discord.utilities.view.text.SimpleDraweeSpanTextView
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.messagesacommon.ChatListFilter
import com.facebook.drawee.span.DraweeSpanStringBuilder
import rx.Subscription
import java.lang.reflect.Field

internal class ClientSideBlock : EndcordPlugin(
    name = "ClientSideBlock",
    description = "Allows you to locally hide almost all content from any user",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            key = "usersToBlock",
            label = "Users To Block",
            description = "User IDs separated by a comma and a space",
            multiline = true,
        ),
        PluginSetting.Switch(
            key = "hideBlockedUsers",
            label = "Hide Blocked Users",
            description = "Should blocked users also be hidden everywhere",
            default = true,
        ),
        PluginSetting.Choice(
            key = "blockedReplyDisplay",
            label = "Blocked Reply Display",
            description = "What should display instead of the message when someone replies to someone you have hidden",
            options = listOf(
                PluginSetting.Choice.Option("displayText", "Display text saying a hidden message was replied to"),
                PluginSetting.Choice.Option("hideReply", "Literally nothing"),
            ),
        ),
    )

    private var relationships: Subscription? = null

    @Volatile
    private var cachedIds: Pair<String, Set<Long>>? = null

    override fun start(context: Context) {
        ChatListFilter.addMessageFilter(name) { message ->
            val authorId = message.author?.id ?: return@addMessageFilter false
            shouldHideUser(authorId)
        }
        relationships = StoreStream.getUserRelationships().observe().subscribe { ChatListFilter.refresh() }
        patchReplies()
    }

    override fun stop(context: Context) {
        relationships?.unsubscribe()
        relationships = null
        ChatListFilter.unregisterAll(name)
        cachedIds = null
        super.stop(context)
    }

    // Hide or show the messages already on screen right away, not only after reopening the channel
    override fun onSettingChanged(key: String) = ChatListFilter.refresh()

    private fun hiddenIds(): Set<Long> {
        val raw = string("usersToBlock")
        cachedIds?.let { if (it.first == raw) return it.second }
        val ids = list("usersToBlock").mapNotNull { it.toLongOrNull() }.toHashSet()
        cachedIds = raw to ids
        return ids
    }

    private fun shouldHideUser(userId: Long): Boolean {
        if (bool("hideBlockedUsers") && StoreStream.getUserRelationships().relationships[userId] == BLOCKED) return true
        return userId in hiddenIds()
    }

    /** Replaces reply previews of hidden users' messages. */
    private fun patchReplies() {
        patcher.after<WidgetChatListAdapterItemMessage>("configureReplyPreview", MessageEntry::class.java) { param ->
            try {
                val entry = param.args[0] as MessageEntry? ?: return@after
                // api Message.e() is the author
                val repliedTo = entry.message.referencedMessage?.e()?.id ?: return@after
                if (!shouldHideUser(repliedTo)) return@after

                val holder = replyHolder.get(this) as View? ?: return@after
                if (choice("blockedReplyDisplay") == "hideReply") {
                    holder.visibility = View.GONE
                    (replyLinkItem.get(this) as View?)?.visibility = View.GONE
                    return@after
                }
                (replyAvatar.get(this) as ImageView?)?.visibility = View.GONE
                (replyIcon.get(this) as ImageView?)?.visibility = View.GONE
                (replyName.get(this) as TextView?)?.visibility = View.GONE
                (replyText.get(this) as SimpleDraweeSpanTextView?)?.let { text ->
                    val label = DraweeSpanStringBuilder()
                    label.append(tr("↓ Replying to blocked message"))
                    label.setSpan(StyleSpan(android.graphics.Typeface.ITALIC), 0, label.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    text.setDraweeSpanStringBuilder(label)
                }
            } catch (e: Throwable) {
                logger.error("Failed to hide a reply preview", e)
            }
        }
    }

    private companion object {
        /** Discord's relationship type for blocked users. */
        const val BLOCKED = 2

        fun field(name: String): Field =
            WidgetChatListAdapterItemMessage::class.java.getDeclaredField(name).apply { isAccessible = true }

        val replyHolder by lazy { field("replyHolder") }
        val replyLinkItem by lazy { field("replyLinkItem") }
        val replyAvatar by lazy { field("replyAvatar") }
        val replyIcon by lazy { field("replyIcon") }
        val replyName by lazy { field("replyName") }
        val replyText by lazy { field("replyText") }
    }
}
