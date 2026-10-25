/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.irccolors

import android.content.Context
import androidx.core.graphics.ColorUtils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.after
import com.discord.databinding.WidgetChannelMembersListItemUserBinding
import com.discord.models.member.GuildMember
import com.discord.stores.StoreMessageReplies
import com.discord.widgets.channels.memberlist.adapter.ChannelMembersListAdapter
import com.discord.widgets.channels.memberlist.adapter.ChannelMembersListViewHolderMember
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.identitycommon.Header
import com.endcord.plugins.identitycommon.Members
import com.endcord.plugins.identitycommon.XXHash64
import java.lang.reflect.Field

internal class IrcColors : EndcordPlugin(
    name = "IrcColors",
    description = "Makes username colors in chat unique, like in IRC clients",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "customisation")

    override val settingsSchema = listOf(
        PluginSetting.Number("lightness", "Lightness, in %. Change if the colors are too light or too dark", default = 70, min = 0, max = 100),
        PluginSetting.Switch("memberListColors", "Replace role colors in the member list", default = true),
        PluginSetting.Switch("applyColorOnlyToUsersWithoutColor", "Apply colors only to users who don't have a predefined color"),
        PluginSetting.Switch("applyColorOnlyInDms", "Apply colors only in direct messages; do not apply colors in servers."),
    )

    // Hue per user id; hashing is cheap but rows rebind constantly
    private val hues = HashMap<Long, Int>()
    private val hsl = FloatArray(3)

    private fun colorFor(userId: Long): Int {
        val hue = hues.getOrPut(userId) { XXHash64.unsignedMod(XXHash64.hash(userId.toString()), 360) }
        hsl[0] = hue.toFloat()
        hsl[1] = 1f
        hsl[2] = int("lightness").coerceIn(0, 100) / 100f
        return ColorUtils.HSLToColor(hsl)
    }

    /** Port of calculateNameColorForMessageContext: null keeps Discord's color. */
    private fun messageColor(userId: Long, member: GuildMember?, inDm: Boolean): Int? {
        if (bool("applyColorOnlyInDms") && !inDm) return null
        if (bool("applyColorOnlyToUsersWithoutColor") && Members.roleColor(member) != null) return null
        return colorFor(userId)
    }

    private val decorator = object : ChatDecorator(name, priority = 40) {
        override fun afterConfigure(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry) {
            val message = entry.message
            val inDm = Members.isPrivate(message.channelId)
            message.author?.let { author ->
                val view = Header.name(holder)
                if (view != null && !message.isInteraction) messageColor(author.id, entry.author, inDm)?.let { view.setTextColor(it) }
            }

            val replyData = entry.replyData ?: return
            if (replyData.messageState !is StoreMessageReplies.MessageState.Loaded) return
            val replied = replyData.messageEntry ?: return
            val repliedAuthor = replied.message.author ?: return
            val replyView = Header.replyName(holder) ?: return
            messageColor(repliedAuthor.id, replied.author, inDm)?.let { replyView.setTextColor(it) }
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
                if (!bool("memberListColors")) return@after
                val item = param.args[0] as ChannelMembersListAdapter.Item.Member
                if (bool("applyColorOnlyInDms") && item.guildId != null) return@after
                if (bool("applyColorOnlyToUsersWithoutColor") && item.color?.let { Members.hasColor(it) } == true) return@after
                val binding = fBinding[this] as WidgetChannelMembersListItemUserBinding
                binding.f.setUsernameColor(colorFor(item.userId))
            } catch (e: Throwable) {
                logger.error("Failed to color the member list", e)
            }
        }
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        hues.clear()
        super.stop(context)
    }
}
