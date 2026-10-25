/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.platformindicators

import android.content.Context
import android.text.SpannableStringBuilder
import android.widget.TextView
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.after
import com.discord.api.presence.ClientStatus
import com.discord.models.presence.Presence
import com.discord.utilities.color.ColorCompat
import com.discord.widgets.channels.memberlist.adapter.ChannelMembersListAdapter
import com.discord.widgets.channels.memberlist.adapter.ChannelMembersListViewHolderMember
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.identitycommon.Header
import com.endcord.plugins.identitycommon.Icons
import com.endcord.plugins.identitycommon.Members
import com.endcord.plugins.identitycommon.Presences
import com.lytefast.flexinput.R
import java.lang.reflect.Field

internal class PlatformIndicators : EndcordPlugin(
    name = "PlatformIndicators",
    description = "Adds platform indicators (Desktop, Mobile, Web...) to users",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance")
    override val restartRequired = false

    override val settingsSchema = listOf(
        PluginSetting.Switch("messages", "Show indicators inside messages", default = true),
        PluginSetting.Switch("list", "Show indicators in the member list", default = true),
    )

    /** Appends one icon per platform the user is connected from, tinted with their status there. */
    private fun appendIcons(builder: SpannableStringBuilder, view: TextView, userId: Long, presence: Presence?): Boolean {
        val statuses = presence?.clientStatuses
        var any = false
        if (statuses == null) {
            // Your own presence has no per platform statuses on Android, and you are on mobile right now
            if (userId != Members.myId() || presence == null) return false
            return appendIcon(builder, view, R.e.ic_mobile, presence.status)
        }
        if (appendIcon(builder, view, R.e.ic_monitor_white_24dp, statuses.a())) any = true
        if (appendIcon(builder, view, R.e.ic_mobile, statuses.b())) any = true
        if (appendIcon(builder, view, R.e.ic_globe_24dp, statuses.c())) any = true
        return any
    }

    private fun appendIcon(builder: SpannableStringBuilder, view: TextView, res: Int, status: ClientStatus?): Boolean {
        val color = statusColor(view.context, status) ?: return false
        return Icons.append(builder, view, res, color, 1.1f)
    }

    private fun statusColor(context: Context, status: ClientStatus?): Int? = when (status) {
        ClientStatus.ONLINE -> ColorCompat.getColor(context, R.c.status_green)
        ClientStatus.IDLE -> ColorCompat.getColor(context, R.c.status_yellow)
        ClientStatus.DND -> ColorCompat.getColor(context, R.c.status_red)
        else -> null
    }

    private val decorator = object : ChatDecorator(name, priority = 62) {
        override fun afterConfigure(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry) {
            if (!bool("messages")) return
            val author = entry.message.author ?: return
            if (author.e() == true) return
            val view = Header.timestamp(holder) ?: return
            val builder = SpannableStringBuilder()
            if (!appendIcons(builder, view, author.id, Presences.get(author.id))) return
            Header.prepend(holder, builder.append(' '))
        }
    }

    private val fBinding: Field by lazy {
        ChannelMembersListViewHolderMember::class.java.getDeclaredField("binding").apply { isAccessible = true }
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)

        patcher.after<ChannelMembersListViewHolderMember>(
            "bind",
            ChannelMembersListAdapter.Item.Member::class.java,
            Function0::class.java,
        ) { param ->
            try {
                if (!bool("list")) return@after
                val item = param.args[0] as ChannelMembersListAdapter.Item.Member
                if (item.isBot) return@after
                val binding = fBinding[this] as com.discord.databinding.WidgetChannelMembersListItemUserBinding
                val nameView = binding.f.j.c
                val builder = SpannableStringBuilder()
                if (!appendIcons(builder, nameView, item.userId, item.presence ?: Presences.get(item.userId))) return@after
                nameView.text = SpannableStringBuilder(nameView.text ?: "").append(' ').append(builder)
            } catch (e: Throwable) {
                logger.error("Failed to add platform indicators to the member list", e)
            }
        }
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        super.stop(context)
    }
}
