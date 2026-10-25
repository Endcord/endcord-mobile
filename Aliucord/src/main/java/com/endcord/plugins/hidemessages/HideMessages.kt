/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.hidemessages

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.tr
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.messagesacommon.ChatListFilter
import com.lytefast.flexinput.R
import java.util.concurrent.ConcurrentHashMap

internal class HideMessages : EndcordPlugin(
    name = "HideMessages",
    description = "Temporarily hide messages until you restart.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Action("showHidden", "Show Hidden Messages", "Bring back every message you hid") {
            val count = hidden.size
            hidden.clear()
            ChatListFilter.refresh()
            Utils.showToast(tr("Showing {count} hidden messages again", "count" to count))
        },
    )

    override fun start(context: Context) {
        ChatListFilter.addMessageFilter(name) { message -> message.id in hidden }
        MessageActions.register(name, "Hide", R.e.ic_visibility_off_white_a60_24dp) {
            hidden.add(it.message.id)
            ChatListFilter.refresh()
        }
    }

    override fun stop(context: Context) {
        ChatListFilter.unregisterAll(name)
        hidden.clear()
        super.stop(context)
    }

    private companion object {
        /** Ids of hidden messages. Kept in memory only, so everything comes back after a restart. */
        val hidden: MutableSet<Long> = ConcurrentHashMap.newKeySet()
    }
}
