/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.permissionsviewer

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.ChannelWrapper.Companion.isGuild
import com.aliucord.wrappers.ChannelWrapper.Companion.name
import com.aliucord.wrappers.ChannelWrapper.Companion.parentId
import com.aliucord.wrappers.ChannelWrapper.Companion.permissionOverwrites
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.aliucord.wrappers.GuildRoleWrapper.Companion.name
import com.aliucord.wrappers.GuildRoleWrapper.Companion.permissions
import com.aliucord.wrappers.GuildRoleWrapper.Companion.position
import com.discord.api.channel.Channel
import com.discord.api.role.GuildRole
import com.discord.models.member.GuildMember
import com.discord.stores.StoreStream
import com.discord.utilities.permissions.PermissionUtils
import com.endcord.plugins.api.UserSheetActions
import com.endcord.plugins.commandscommon.Dialogs
import com.endcord.plugins.userscommon.Users
import com.lytefast.flexinput.R

internal class PermissionsViewer : EndcordPlugin(
    name = "PermissionsViewer",
    description = "View the permissions a user has in a server and in the channel you opened their profile from, and which roles grant them",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("servers", "roles", "utility")

    override fun start(context: Context) {
        UserSheetActions.register(
            name,
            "View Permissions",
            R.e.ic_key_24dp,
            visible = { (it.state.guildId ?: 0L) != 0L },
        ) { ctx ->
            val activity = ctx.sheet.activity ?: return@register
            val guildId = ctx.state.guildId ?: return@register
            val title = "${I18n.t("Permissions")}: ${Users.displayName(ctx.user)}"
            val member = StoreStream.getGuilds().getMember(guildId, ctx.user.id) ?: ctx.state.guildMember
            val text = if (member == null) I18n.t("No permissions to display!")
            else describe(activity, ctx.user.id, guildId, member, ctx.state.channel)
            Dialogs.showText(activity, title, text)
        }
    }

    private fun describe(context: Context, userId: Long, guildId: Long, member: GuildMember, sheetChannel: Channel?): String {
        val guilds = StoreStream.getGuilds()
        val guild = guilds.getGuild(guildId) ?: return I18n.t("No permissions to display!")
        val roles: Map<Long, GuildRole> = guilds.roles[guildId] ?: emptyMap()
        val sb = StringBuilder()

        // The member's roles, highest first, with @everyone last
        val memberRoles = (member.roles ?: emptyList()).mapNotNull { roles[it] }.sortedByDescending { it.position }
        val everyone = roles[guildId]
        val granting = if (everyone != null) memberRoles + everyone else memberRoles

        val serverPerms = PermissionUtils.computeNonThreadPermissions(userId, guildId, guild.ownerId, member, roles, null)
        val isOwner = guild.ownerId == userId
        val isAdmin = !isOwner && granting.any { it.permissions and ADMINISTRATOR != 0L }

        sb.append(I18n.t("Server Permissions")).append('\n')
        when {
            isOwner -> sb.append("• ").append(I18n.t("Server owner")).append(" — ").append(I18n.t("Has every permission")).append('\n')
            isAdmin -> sb.append("• ").append(permissionName(context, 3)).append(" — ").append(I18n.t("Has every permission")).append('\n')
            else -> {
                val bits = setBits(serverPerms)
                if (bits.isEmpty()) sb.append(I18n.t("No permissions to display!")).append('\n')
                for (bit in bits) {
                    val by = granting.filter { it.permissions and (1L shl bit) != 0L }.joinToString(", ") { "@" + it.name }
                    sb.append("• ").append(permissionName(context, bit))
                    if (by.isNotEmpty()) sb.append("  (").append(by).append(')')
                    sb.append('\n')
                }
            }
        }

        // Overwrites of the channel the profile was opened from, compared to the server permissions
        val channel = resolveChannel(sheetChannel)
        if (channel != null && channel.guildId == guildId && !isOwner && !isAdmin) {
            val channelPerms = PermissionUtils.computeNonThreadPermissions(
                userId, guildId, guild.ownerId, member, roles, channel.permissionOverwrites,
            )
            val allowed = setBits(channelPerms and serverPerms.inv())
            val denied = setBits(serverPerms and channelPerms.inv())
            sb.append('\n').append(I18n.t("Channel Permissions")).append(": #").append(channel.name).append('\n')
            if (allowed.isEmpty() && denied.isEmpty()) {
                sb.append(I18n.t("Not overwritten")).append('\n')
            }
            if (allowed.isNotEmpty()) {
                sb.append(I18n.t("Allowed")).append(": ").append(allowed.joinToString(", ") { permissionName(context, it) }).append('\n')
            }
            if (denied.isNotEmpty()) {
                sb.append(I18n.t("Denied")).append(": ").append(denied.joinToString(", ") { permissionName(context, it) }).append('\n')
            }
        }

        if (memberRoles.isNotEmpty()) {
            sb.append('\n').append(I18n.t("Roles")).append(" (").append(memberRoles.size).append(")\n")
            sb.append(memberRoles.joinToString(", ") { "@" + it.name })
        }
        return sb.toString().trimEnd()
    }

    /** Threads take their overwrites from their parent channel. */
    private fun resolveChannel(channel: Channel?): Channel? {
        if (channel == null || !channel.isGuild()) return null
        return when (channel.type) {
            Channel.PUBLIC_THREAD, Channel.PRIVATE_THREAD, Channel.ANNOUNCEMENT_THREAD ->
                StoreStream.getChannels().getChannel(channel.parentId)
            else -> channel
        }
    }

    private fun setBits(value: Long): List<Int> {
        val bits = ArrayList<Int>()
        var bit = 0
        while (bit < 63) {
            if (value and (1L shl bit) != 0L) bits.add(bit)
            bit++
        }
        return bits
    }

    /** Discord's own (translated) name of a permission, or an English one for permissions newer than the app. */
    private fun permissionName(context: Context, bit: Int): String {
        val resName = RESOURCE_NAMES[bit]
        if (resName != null) {
            val id = Utils.getResId(resName, "string")
            if (id != 0) {
                try {
                    return context.getString(id)
                } catch (_: Throwable) {
                }
            }
        }
        val english = ENGLISH_NAMES[bit] ?: return I18n.t("Unknown permission ({bit})", "bit" to bit)
        return I18n.t(english)
    }

    private companion object {
        const val ADMINISTRATOR = 1L shl 3

        /** Permission bits mapped to the name of the app's string resource for them. */
        val RESOURCE_NAMES = mapOf(
            0 to "create_instant_invite",
            1 to "kick_members",
            2 to "ban_members",
            3 to "administrator",
            4 to "manage_channels",
            5 to "manage_server",
            6 to "add_reactions",
            7 to "view_audit_log",
            8 to "priority_speaker",
            9 to "video",
            10 to "view_channel",
            11 to "send_messages",
            12 to "send_tts_messages",
            13 to "manage_messages",
            14 to "embed_links",
            15 to "attach_files",
            16 to "read_message_history",
            17 to "mention_everyone",
            18 to "use_external_emojis",
            19 to "view_guild_analytics",
            20 to "connect",
            21 to "speak",
            22 to "mute_members",
            23 to "deafen_members",
            24 to "move_members",
            25 to "use_vad",
            26 to "change_nickname",
            27 to "manage_nicknames",
            28 to "manage_roles",
            29 to "manage_webhooks",
            30 to "manage_emojis_and_stickers",
            31 to "use_application_commands",
            32 to "request_to_speak",
            33 to "manage_events",
            34 to "manage_threads",
            35 to "create_public_threads",
            36 to "create_private_threads",
            37 to "use_external_stickers",
            38 to "send_messages_in_threads",
            39 to "use_embedded_activities",
            40 to "moderate_member",
        )

        /** Permissions added to Discord after this version of the app. */
        val ENGLISH_NAMES = mapOf(
            41 to "View Creator Monetization Analytics",
            42 to "Use Soundboard",
            43 to "Create Expressions",
            44 to "Create Events",
            45 to "Use External Sounds",
            46 to "Send Voice Messages",
            49 to "Create Polls",
            50 to "Use External Apps",
            51 to "Pin Messages",
            52 to "Bypass Slowmode",
        )
    }
}
