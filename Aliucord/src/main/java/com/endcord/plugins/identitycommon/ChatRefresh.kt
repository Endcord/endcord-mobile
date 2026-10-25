/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.identitycommon

import com.aliucord.Utils
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapter
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import java.lang.ref.WeakReference

/**
 * Redraws the visible chat rows after data that decorations depend on changed (a setting, a timezone list that
 * finished loading...). Remembers the chat list a row was last bound in; nothing is kept alive by it.
 */
internal object ChatRefresh {
    private var adapter: WeakReference<WidgetChatListAdapter>? = null

    /** Call while a row binds, so [refresh] knows which list to redraw. Cheap. */
    fun track(holder: WidgetChatListAdapterItemMessage) {
        val current = WidgetChatListAdapterItemMessage.`access$getAdapter$p`(holder) ?: return
        if (adapter?.get() !== current) adapter = WeakReference(current)
    }

    /** Rebinds every visible message. Safe to call from any thread. */
    fun refresh() {
        Utils.mainThread.post {
            try {
                adapter?.get()?.notifyDataSetChanged()
            } catch (ignored: Throwable) {
                // The list may be in the middle of a layout pass; the next scroll rebinds anyway
            }
        }
    }
}
