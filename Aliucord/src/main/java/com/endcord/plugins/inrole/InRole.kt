/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.inrole

import android.content.Context
import androidx.fragment.app.FragmentActivity
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.tr
import com.aliucord.wrappers.GuildRoleWrapper.Companion.name
import com.discord.models.member.GuildMember
import com.discord.stores.StoreStream
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.commandscommon.Dialogs
import com.endcord.plugins.commandscommon.Options
import com.endcord.plugins.commandscommon.Patterns
import com.lytefast.flexinput.R
import java.util.regex.Pattern

internal class InRole : EndcordPlugin(
    name = "InRole",
    description = "Know who is in a role with the /inrole command or the menu of a message that mentions it (read plugin info!)",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("commands", "roles")

    private val roleMention = Pattern.compile("<@&([0-9]+)>")

    override fun start(context: Context) {
        commands.registerCommand(
            "inrole",
            "Know who is in a role",
            listOf(Options.role("role", "The role", required = true)),
        ) { ctx ->
            val guildId = ctx.currentChannel.guildId
            if (guildId == 0L) return@registerCommand CommandResult(tr("Make sure that you are in a server."), null, false)
            val roleId = ctx.getRequiredLong("role")
            val members = membersInRole(guildId, roleId)
            CommandResult(formatList(roleId, members), null, false)
        }

        MessageActions.register(
            name,
            "View Members in Role",
            R.e.ic_role_24dp,
            visible = { it.model.guild != null && Patterns.contains(roleMention, it.message.content ?: "") },
        ) { actx ->
            val guildId = actx.model.guild?.id ?: return@register
            val activity = actx.sheet.activity ?: return@register
            val roleIds = Patterns.findAll(roleMention, actx.message.content ?: "", 1).mapNotNull { it.toLongOrNull() }.distinct()
            val roles = StoreStream.getGuilds().roles[guildId] ?: emptyMap()
            when {
                roleIds.isEmpty() -> return@register
                roleIds.size == 1 -> showMembers(activity, guildId, roleIds[0])
                else -> Dialogs.showList(activity, tr("View Members in Role"), roleIds.map { "@" + (roles[it]?.name ?: it.toString()) }) {
                    showMembers(activity, guildId, roleIds[it])
                }
            }
        }
    }

    /**
     * Members of the role that the app has cached. Large servers only send members as they are needed
     * (chat, member list), so offline members are usually missing, just like on Endcord PC.
     */
    private fun membersInRole(guildId: Long, roleId: Long): List<GuildMember> {
        val members = StoreStream.getGuilds().members[guildId]?.values ?: return emptyList()
        // Everyone has the @everyone role, whose id is the server's id
        return if (roleId == guildId) members.toList() else members.filter { it.roles?.contains(roleId) == true }
    }

    private fun formatList(roleId: Long, members: List<GuildMember>): String {
        if (members.isEmpty()) {
            return tr("Looks like no online cached members with that role were found. Try scrolling down on your member list to cache more users!")
        }
        val shown = members.take(MAX_LISTED)
        val sb = StringBuilder()
        sb.append("**").append(tr("Members of role")).append("** <@&").append(roleId).append("> (").append(members.size).append(")\n")
        for (member in shown) sb.append("<@").append(member.userId).append(">\n")
        if (members.size > shown.size) sb.append(tr("...and {count} more", "count" to members.size - shown.size))
        return sb.toString().trimEnd()
    }

    private fun showMembers(activity: FragmentActivity, guildId: Long, roleId: Long) {
        val members = membersInRole(guildId, roleId)
        val role = StoreStream.getGuilds().roles[guildId]?.get(roleId)
        val title = "${tr("Members of role")} @${role?.name ?: roleId} (${members.size})"
        if (members.isEmpty()) {
            Dialogs.showText(activity, title, tr("Looks like no online cached members with that role were found. Try scrolling down on your member list to cache more users!"))
            return
        }
        val users = StoreStream.getUsers().users
        val sorted = members
            .map { member -> member to (users[member.userId]?.let { GuildMember.getNickOrUsername(member, it) } ?: member.nick ?: member.userId.toString()) }
            .sortedBy { it.second.lowercase() }
        Dialogs.showList(activity, title, sorted.map { it.second }) { index ->
            UserSheet.show(sorted[index].first.userId, guildId, activity.supportFragmentManager)
        }
    }

    private companion object {
        const val MAX_LISTED = 100
    }
}
