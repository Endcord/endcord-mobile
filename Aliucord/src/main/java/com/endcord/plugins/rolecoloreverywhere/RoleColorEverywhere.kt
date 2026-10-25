/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.rolecoloreverywhere

import android.content.Context
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import androidx.core.graphics.ColorUtils
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.after
import com.aliucord.wrappers.GuildRoleWrapper.Companion.color
import com.discord.databinding.WidgetChannelMembersListItemHeaderBinding
import com.discord.widgets.channels.memberlist.adapter.ChannelMembersListAdapter
import com.discord.widgets.channels.memberlist.adapter.ChannelMembersListViewHolderRoleHeader
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.identitycommon.Members
import java.lang.reflect.Field

internal class RoleColorEverywhere : EndcordPlugin(
    name = "RoleColorEverywhere",
    description = "Adds the top role color anywhere possible",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("roles", "appearance")

    override val settingsSchema = listOf(
        PluginSetting.Switch("chatMentions", "Show role colors in chat mentions (including in the message box)", default = true),
        PluginSetting.Switch("memberList", "Show role colors in member list role headers", default = true),
        PluginSetting.Switch("colorChatMessages", "Color chat messages based on the author's role color"),
        PluginSetting.Number("messageSaturation", "Intensity of message coloring.", default = 30, min = 0, max = 100),
    )

    private val decorator = object : ChatDecorator(name, priority = 30) {
        override fun decorateText(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, text: SpannableStringBuilder) {
            if (text.isEmpty()) return
            val guildId = Members.guildId(entry)
            if (guildId == 0L) return
            if (bool("chatMentions")) colorMentions(entry, guildId, text)
            if (bool("colorChatMessages")) colorMessage(holder, entry, text)
        }
    }

    /**
     * User mentions are rendered as "@name" with a background span. The name is matched against the names Discord
     * resolved for this message, which is where the mention text came from.
     */
    private fun colorMentions(entry: MessageEntry, guildId: Long, text: SpannableStringBuilder) {
        val backgrounds = text.getSpans(0, text.length, BackgroundColorSpan::class.java)
        if (backgrounds.isEmpty()) return
        val names = entry.nickOrUsernames ?: return
        for (bg in backgrounds) {
            val start = text.getSpanStart(bg)
            val end = text.getSpanEnd(bg)
            if (end - start < 2 || text[start] != '@') continue
            val name = text.substring(start + 1, end)
            var userId = 0L
            for ((id, n) in names) if (n == name) {
                userId = id
                break
            }
            if (userId == 0L) continue
            val color = Members.roleColor(Members.member(guildId, userId)) ?: continue
            val opaque = color or 0xFF000000.toInt()

            for (fg in text.getSpans(start, end, ForegroundColorSpan::class.java)) {
                if (text.getSpanStart(fg) == start && text.getSpanEnd(fg) == end) text.removeSpan(fg)
            }
            val flags = text.getSpanFlags(bg)
            text.removeSpan(bg)
            text.setSpan(BackgroundColorSpan(ColorUtils.setAlphaComponent(opaque, 0x26)), start, end, flags)
            text.setSpan(ForegroundColorSpan(opaque), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
    }

    /** Port of useMessageColorsStyle: tints the text towards the author's role color; other colors still win. */
    private fun colorMessage(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, text: SpannableStringBuilder) {
        val saturation = int("messageSaturation").coerceIn(0, 100)
        if (saturation == 0) return
        val color = Members.roleColor(entry.author) ?: return
        val view = WidgetChatListAdapterItemMessage.`access$getItemText$p`(holder) ?: return
        val mixed = ColorUtils.blendARGB(view.currentTextColor, color or 0xFF000000.toInt(), saturation / 100f)
        // The highest span priority makes the text draw this color first, so links, mentions and code keep theirs
        val flags = Spanned.SPAN_INCLUSIVE_INCLUSIVE or (255 shl Spanned.SPAN_PRIORITY_SHIFT)
        text.setSpan(ForegroundColorSpan(mixed), 0, text.length, flags)
    }

    private val fHeaderBinding: Field by lazy {
        ChannelMembersListViewHolderRoleHeader::class.java.getDeclaredField("binding").apply { isAccessible = true }
    }

    // Any id the app declares works as a view tag key
    private val defaultColorKey: Int by lazy { Utils.getResId("chat_list_adapter_item_text_header", "id") }

    override fun start(context: Context) {
        ChatHooks.register(decorator)

        patcher.after<ChannelMembersListViewHolderRoleHeader>("bind", ChannelMembersListAdapter.Item.RoleHeader::class.java) { param ->
            try {
                val item = param.args[0] as ChannelMembersListAdapter.Item.RoleHeader
                val view = (fHeaderBinding[this] as WidgetChannelMembersListItemHeaderBinding).c
                // Headers are recycled between roles, so remember the theme's color to put back for roles without one
                val default = view.getTag(defaultColorKey) as? Int ?: view.currentTextColor.also { view.setTag(defaultColorKey, it) }
                val roleColor = if (bool("memberList")) {
                    item.guildId?.let { Members.roles(it)?.get(item.roleId) }?.color?.takeIf { Members.hasColor(it) }
                } else null
                view.setTextColor(roleColor?.let { it or 0xFF000000.toInt() } ?: default)
            } catch (e: Throwable) {
                logger.error("Failed to color a role header", e)
            }
        }
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        super.stop(context)
    }
}
