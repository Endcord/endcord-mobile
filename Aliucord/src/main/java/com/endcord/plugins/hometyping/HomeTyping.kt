/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.hometyping

import android.content.Context
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import com.aliucord.patcher.after
import com.aliucord.wrappers.ChannelWrapper.Companion.isDM
import com.discord.databinding.WidgetGuildsListItemProfileBinding
import com.discord.stores.StoreStream
import com.discord.views.typing.TypingDots
import com.discord.widgets.guilds.list.GuildListItem
import com.discord.widgets.guilds.list.GuildListViewHolder
import com.endcord.plugins.guildsbcommon.GuildsBPlugin
import com.endcord.plugins.guildsbcommon.TypingState
import java.lang.ref.WeakReference
import java.lang.reflect.Field

/**
 * The home button above the server list shows Discord's typing dots instead of its logo while someone is typing in
 * one of your direct messages or group chats. The button is updated in place from the shared typing state.
 */
internal class HomeTyping : GuildsBPlugin(
    name = "HomeTyping",
    description = "Changes the home button to a typing indicator if someone in your dms is typing",
) {
    override val tags = listOf("chat")

    private val bindingField: Field by lazy {
        GuildListViewHolder.FriendsViewHolder::class.java.getDeclaredField("binding").apply { isAccessible = true }
    }

    private var holder: WeakReference<GuildListViewHolder.FriendsViewHolder>? = null
    private var dotsView: WeakReference<TypingDots>? = null

    override fun start(context: Context) {
        patcher.after<GuildListViewHolder.FriendsViewHolder>("configure", GuildListItem.FriendsItem::class.java) {
            try {
                if (holder?.get() !== this) holder = WeakReference(this)
                update(TypingState.current)
            } catch (e: Throwable) {
                logger.error("Failed to update the home button", e)
            }
        }
        TypingState.register(name) { typing ->
            try {
                update(typing)
            } catch (e: Throwable) {
                logger.error("Failed to update the home button", e)
            }
        }
    }

    private fun someoneTypingInDms(typing: Map<Long, Set<Long>>): Boolean {
        if (typing.isEmpty()) return false
        val channels = StoreStream.getChannels()
        for ((channelId, users) in typing) {
            if (users.isEmpty()) continue
            val channel = channels.getChannel(channelId) ?: continue
            if (channel.isDM()) return true
        }
        return false
    }

    private fun update(typing: Map<Long, Set<Long>>) {
        val holder = holder?.get() ?: return
        val binding = bindingField.get(holder) as? WidgetGuildsListItemProfileBinding ?: return
        show(binding, someoneTypingInDms(typing))
    }

    private fun show(binding: WidgetGuildsListItemProfileBinding, typing: Boolean) {
        val wrap: FrameLayout = binding.c
        var dots = dotsView?.get()?.takeIf { it.parent === wrap }
        if (!typing) {
            binding.b.visibility = View.VISIBLE
            if (dots != null) {
                dots.c()
                dots.visibility = View.GONE
            }
            return
        }
        if (dots == null) {
            dots = TypingDots(wrap.context, null).apply {
                id = DOTS_ID
                layoutParams = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER,
                )
            }
            for (i in wrap.childCount - 1 downTo 0) if (wrap.getChildAt(i).id == DOTS_ID) wrap.removeViewAt(i)
            wrap.addView(dots)
            dotsView = WeakReference(dots)
        }
        binding.b.visibility = View.INVISIBLE
        if (dots.visibility != View.VISIBLE) {
            dots.visibility = View.VISIBLE
            dots.a(false)
        } else if (!dots.n) {
            dots.a(false)
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        val holder = holder?.get()
        if (holder != null) {
            try {
                val binding = bindingField.get(holder) as? WidgetGuildsListItemProfileBinding
                if (binding != null) {
                    binding.b.visibility = View.VISIBLE
                    val wrap = binding.c
                    for (i in wrap.childCount - 1 downTo 0) {
                        val child = wrap.getChildAt(i)
                        if (child.id == DOTS_ID) {
                            (child as? TypingDots)?.c()
                            wrap.removeViewAt(i)
                        }
                    }
                }
            } catch (e: Throwable) {
                logger.error("Failed to restore the home button", e)
            }
        }
        this.holder = null
        dotsView = null
    }

    private companion object {
        val DOTS_ID = View.generateViewId()
    }
}
