/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.notifycommon

import com.discord.api.channel.Channel
import com.discord.api.message.Message as ApiMessage

/**
 * For plugins that replace Discord's in-app popup for some messages with their own notification.
 *
 * [decide] runs before Discord's stores see a new message. Messages it accepts don't get Discord's popup, and
 * [show] is called for them once the stores processed the message (so authors and channels are cached).
 * This way the user never gets two popups for the same message.
 */
internal class OwnPopups(
    private val owner: String,
    private val decide: (ApiMessage) -> Boolean,
    private val show: (ApiMessage) -> Unit,
) {
    private val pending = LinkedHashSet<Long>()

    fun start() {
        NotifyHooks.trackAppState(owner)
        NotifyHooks.incoming(owner, priority = 200) { incoming ->
            val message = incoming.api ?: return@incoming
            if (incoming.source != NotifyHooks.Source.CREATE) return@incoming
            if (Msg.isOwn(message) || !Msg.isFresh(message) || !decide(message)) return@incoming
            synchronized(pending) {
                pending.add(message.o())
                // Only the last few matter; drop old ids in case a message never reached the stores
                while (pending.size > 50) pending.remove(pending.first())
            }
        }
        NotifyHooks.popups(owner, listener = object : NotifyHooks.PopupListener {
            override fun allowPopup(message: ApiMessage, channel: Channel): Boolean =
                synchronized(pending) { message.o() !in pending }
        })
        NotifyHooks.messages(owner) { message ->
            val mine = synchronized(pending) { pending.remove(message.o()) }
            if (mine) show(message)
        }
    }
}
