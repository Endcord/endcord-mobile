/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.showrolesinchat

import android.content.Context
import android.text.SpannableStringBuilder
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.GuildRoleWrapper.Companion.color
import com.aliucord.wrappers.GuildRoleWrapper.Companion.name
import com.discord.api.role.GuildRole
import com.discord.models.message.Message
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.commandscommon.Dialogs
import com.endcord.plugins.identitycommon.ChatRefresh
import com.endcord.plugins.identitycommon.Header
import com.endcord.plugins.identitycommon.Icons
import com.endcord.plugins.identitycommon.Members
import com.lytefast.flexinput.R

internal class ShowRolesInChat : EndcordPlugin(
    name = "ShowRolesInChat",
    description = "Shows a user's highest role next to their name in chat messages. Hide/show specific roles by long-pressing a message.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "chat", "roles", "servers")

    override val settingsSchema = listOf(
        PluginSetting.Switch("showBots", "Whether to show the highest role on bots."),
        PluginSetting.Switch("useRoleColor", "Use the role's color for the icon.", default = true),
        PluginSetting.Action("unhideAll", "Unhide Roles in Chat") {
            settings.setString(EXCLUDED, "")
            ChatRefresh.refresh()
        },
    )

    // Parsed once per change of the setting, not per row
    private var excludedRaw: String? = null
    private var excludedIds: Set<Long> = emptySet()

    private fun excluded(): Set<Long> {
        val raw = settings.getString(EXCLUDED, "") ?: ""
        if (raw != excludedRaw) {
            excludedIds = raw.split(',').mapNotNull { it.trim().toLongOrNull() }.toHashSet()
            excludedRaw = raw
        }
        return excludedIds
    }

    private fun setExcluded(ids: Set<Long>) {
        settings.setString(EXCLUDED, ids.joinToString(","))
        ChatRefresh.refresh()
    }

    /** The author's highest role that isn't hidden, or null when nothing should be shown. */
    private fun highestRole(message: Message, entryRoles: Map<Long, GuildRole>?): GuildRole? {
        val author = message.author ?: return null
        if (author.e() == true && !bool("showBots")) return null
        val guildId = Members.guildId(message)
        if (guildId == 0L) return null
        val member = Members.member(guildId, author.id) ?: return null
        return Members.sortedRoles(member, entryRoles ?: Members.roles(guildId), excluded()).firstOrNull()
    }

    private val decorator = object : ChatDecorator(name, priority = 63) {
        override fun afterConfigure(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry) {
            ChatRefresh.track(holder)
            val view = Header.timestamp(holder) ?: return
            val role = highestRole(entry.message, entry.roles) ?: return
            val builder = SpannableStringBuilder()
            val tint = if (bool("useRoleColor") && Members.hasColor(role.color)) role.color or 0xFF000000.toInt() else view.currentTextColor
            Icons.append(builder, view, R.e.ic_person_shield_24dp, tint, 1.05f)
            builder.append(role.name).append("  ")
            Header.prepend(holder, builder)
        }
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)

        MessageActions.register(
            name,
            "Hide Role in Chat",
            R.e.ic_visibility_off_white_a60_24dp,
            visible = { highestRole(it.message, null) != null },
        ) {
            val role = highestRole(it.message, null) ?: return@register
            setExcluded(excluded() + role.id)
        }

        MessageActions.register(
            name,
            "Unhide Roles in Chat",
            R.e.ic_visibility_white_24dp,
            visible = { hiddenRolesOf(it.message).isNotEmpty() },
        ) { ctx ->
            val hidden = hiddenRolesOf(ctx.message)
            val activity = ctx.sheet.activity ?: return@register
            Dialogs.showList(activity, I18n.t("Unhide Roles in Chat"), hidden.map { it.name }) { index ->
                setExcluded(excluded() - hidden[index].id)
            }
        }
    }

    private fun hiddenRolesOf(message: Message): List<GuildRole> {
        val excluded = excluded()
        if (excluded.isEmpty()) return emptyList()
        val author = message.author ?: return emptyList()
        val guildId = Members.guildId(message)
        val member = Members.member(guildId, author.id) ?: return emptyList()
        return Members.sortedRoles(member, Members.roles(guildId)).filter { it.id in excluded }
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        super.stop(context)
    }

    private companion object {
        const val EXCLUDED = "excludedRoles"
    }
}
