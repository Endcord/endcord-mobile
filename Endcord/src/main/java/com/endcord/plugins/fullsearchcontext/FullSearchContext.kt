/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.fullsearchcontext

import android.content.Context
import androidx.fragment.app.FragmentManager
import com.aliucord.patcher.after
import com.aliucord.patcher.before
import com.aliucord.patcher.instead
import com.aliucord.utils.RxUtils
import com.discord.models.message.Message
import com.discord.stores.StoreMessages
import com.discord.widgets.chat.list.actions.WidgetChatListActions
import com.discord.widgets.search.results.WidgetSearchResults
import com.endcord.plugins.guildsbcommon.GuildsBPlugin
import java.lang.reflect.Field

/**
 * In search results the legacy app only jumps to a message, on tap and on long-press alike. Long-pressing a result
 * now opens the full message sheet (reply, react, copy, pin, edit, delete, every plugin action...) like in chat; tap
 * still jumps to the message.
 *
 * The sheet looks the message up in the loaded messages of its channel, where search results usually aren't, so
 * while the sheet builds its model for that message it is handed the message from the search results instead.
 */
internal class FullSearchContext : GuildsBPlugin(
    name = "FullSearchContext",
    description = "Makes the message context menu in message search results have all options you'd expect",
) {
    override val tags = listOf("utility")

    private val fragmentManagerField: Field by lazy {
        WidgetSearchResults.SearchResultAdapterEventHandler::class.java.getDeclaredField("fragmentManager")
            .apply { isAccessible = true }
    }

    /** The search result the sheet was opened for. */
    @Volatile private var pending: Message? = null
    private val inModel = ThreadLocal<Boolean>()

    override fun start(context: Context) {
        patcher.instead<WidgetSearchResults.SearchResultAdapterEventHandler>(
            "onMessageLongClicked", Message::class.java, CharSequence::class.java, Boolean::class.javaPrimitiveType!!,
        ) { param ->
            val message = param.args[0] as Message
            try {
                val fragmentManager = fragmentManagerField.get(this) as FragmentManager
                pending = message
                MessageSheet.show(fragmentManager, message.channelId, message.id, param.args[1] as CharSequence)
            } catch (e: Throwable) {
                logger.error("Failed to open the message sheet", e)
                return@instead de.robv.android.xposed.XposedBridge.invokeOriginalMethod(param.method, this, param.args)
            }
            null
        }

        val long = Long::class.javaPrimitiveType!!
        patcher.before<WidgetChatListActions.Model.Companion>(
            "get", long, long, CharSequence::class.java, Int::class.javaPrimitiveType!!,
        ) { param ->
            val p = pending
            if (p != null && param.args[0] == p.channelId && param.args[1] == p.id) inModel.set(true)
        }
        patcher.after<WidgetChatListActions.Model.Companion>(
            "get", long, long, CharSequence::class.java, Int::class.javaPrimitiveType!!,
        ) { inModel.set(false) }

        patcher.after<StoreMessages>("observeMessagesForChannel", long, long) { param ->
            if (inModel.get() != true) return@after
            val p = pending ?: return@after
            if (param.args[0] != p.channelId || param.args[1] != p.id) return@after
            param.result = RxUtils.create<Message> { subscriber ->
                subscriber.onNext(p)
                subscriber.onCompleted()
            }
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        pending = null
    }
}
