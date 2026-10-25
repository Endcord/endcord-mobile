/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.identitycommon

import android.text.SpannableStringBuilder
import android.widget.TextView
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import java.lang.reflect.Field

/**
 * The views of a message row's header (author name, tag and timestamp) and of its reply preview.
 *
 * The header is a single line: name, role icon, tag, timestamp. Decorations that Endcord PC shows right after
 * the author name (badges, roles, platform icons) are put in front of the timestamp text, so they sit between
 * the name (and its tag) and the time without touching the name itself, which other plugins rewrite.
 * Discord sets the timestamp text again on every bind, so nothing has to be undone.
 */
internal object Header {
    private val fName: Field by lazy { field("itemName") }
    private val fTag: Field by lazy { field("itemTag") }
    private val fTimestamp: Field by lazy { field("itemTimestamp") }
    private val fReplyName: Field by lazy { field("replyName") }
    private val fReplyHolder: Field by lazy { field("replyHolder") }

    private fun field(name: String): Field =
        WidgetChatListAdapterItemMessage::class.java.getDeclaredField(name).apply { isAccessible = true }

    /** The author name, or null for grouped rows without a header. */
    fun name(holder: WidgetChatListAdapterItemMessage): TextView? = fName[holder] as TextView?

    /** Discord's tag next to the name (BOT, SYSTEM...), or null for rows without a header. */
    fun tag(holder: WidgetChatListAdapterItemMessage): TextView? = fTag[holder] as TextView?

    /** The timestamp next to the name, or null for grouped rows without a header. */
    fun timestamp(holder: WidgetChatListAdapterItemMessage): TextView? = fTimestamp[holder] as TextView?

    /** The author name of the reply preview, or null when the row shows no reply. */
    fun replyName(holder: WidgetChatListAdapterItemMessage): TextView? {
        val replyHolder = fReplyHolder[holder] as android.view.View? ?: return null
        if (replyHolder.visibility != android.view.View.VISIBLE) return null
        return fReplyName[holder] as TextView?
    }

    /**
     * Shows [segment] right after the author name (and tag), in front of the timestamp. Call from
     * [com.endcord.plugins.api.ChatDecorator.afterConfigure]: the last plugin to call it ends up first.
     */
    fun prepend(holder: WidgetChatListAdapterItemMessage, segment: CharSequence) {
        val view = timestamp(holder) ?: return
        view.text = SpannableStringBuilder(segment).append(view.text ?: "")
    }
}
