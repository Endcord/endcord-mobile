/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.gifpaste

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.patcher.instead
import com.discord.stores.StoreChat
import com.discord.stores.StoreStream
import com.discord.widgets.chat.input.gifpicker.GifAdapterItem
import com.discord.widgets.chat.input.gifpicker.GifCategoryViewModel
import com.discord.widgets.chat.input.gifpicker.GifSearchViewModel
import rx.subjects.PublishSubject
import java.lang.reflect.Field

internal class GifPaste : EndcordPlugin(
    name = "GifPaste",
    description = "Makes picking a gif in the gif picker insert a link into the chatbox instead of instantly sending it",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("media", "chat")

    override fun start(context: Context) {
        // Both view models send the GIF's link as a message right away; the fragments close the picker afterwards
        // on their own, so replacing the send with an append is all that is needed.
        patcher.instead<GifCategoryViewModel>("selectGif", GifAdapterItem.GifItem::class.java) { param ->
            insert(param.args[0] as GifAdapterItem.GifItem?)
            null
        }
        patcher.instead<GifSearchViewModel>("selectGif", GifAdapterItem.GifItem::class.java) { param ->
            insert(param.args[0] as GifAdapterItem.GifItem?)
            null
        }
    }

    private fun insert(item: GifAdapterItem.GifItem?) {
        val url = item?.gif?.tenorGifUrl
        if (url.isNullOrEmpty()) return
        try {
            // The same event "mention this user" uses: the chat input appends the text to what is typed
            @Suppress("UNCHECKED_CAST")
            val events = eventSubject[StoreStream.getChat()] as PublishSubject<StoreChat.Event>
            events.onNext(StoreChat.Event.AppendChatText("$url "))
        } catch (e: Throwable) {
            logger.error("Failed to insert the GIF link", e)
        }
    }

    private companion object {
        val eventSubject: Field by lazy {
            StoreChat::class.java.getDeclaredField("eventSubject").apply { isAccessible = true }
        }
    }
}
