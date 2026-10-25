/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.mutualservermembers

import android.content.Context
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.discord.models.guild.Guild
import com.discord.stores.StoreStream
import com.endcord.plugins.commandscommon.Options
import java.util.Locale

internal class MutualServerMembers : EndcordPlugin(
    name = "MutualServerMembers",
    description = "Compare two servers you're in and see which members are in both, with the /mutualmembers command. Only members the app has loaded are compared.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("servers", "commands")

    override fun start(context: Context) {
        commands.registerCommand(
            "mutualmembers",
            "See which members are in both of two servers",
            listOf(
                Options.string("server", "ID or name of the server to compare with", required = true),
                Options.string("other", "ID or name of the second server, defaults to the current one"),
            ),
        ) { ctx ->
            val first = findGuild(ctx.getRequiredString("server"))
                ?: return@registerCommand CommandResult(I18n.t("Couldn't find that server."), null, false)
            val otherArg = ctx.getString("other")
            val second = if (otherArg.isNullOrBlank()) {
                StoreStream.getGuilds().getGuild(ctx.currentChannel.guildId)
            } else {
                findGuild(otherArg)
            } ?: return@registerCommand CommandResult(I18n.t("Make sure that you are in a server."), null, false)

            if (first.id == second.id) {
                return@registerCommand CommandResult(I18n.t("Pick two different servers."), null, false)
            }
            CommandResult(compare(first, second), null, false)
        }
    }

    private fun findGuild(query: String): Guild? {
        val guilds = StoreStream.getGuilds().guilds
        query.trim().toLongOrNull()?.let { id -> guilds[id]?.let { return it } }
        val name = query.trim().lowercase(Locale.ROOT)
        return guilds.values.firstOrNull { it.name.lowercase(Locale.ROOT) == name }
            ?: guilds.values.firstOrNull { it.name.lowercase(Locale.ROOT).contains(name) }
    }

    private fun compare(a: Guild, b: Guild): String {
        val members = StoreStream.getGuilds().members
        val inA = members[a.id]?.keys ?: emptySet<Long>()
        val inB = members[b.id]?.keys ?: emptySet<Long>()
        val me = StoreStream.getUsers().me.id
        val both = inA.filter { it != me && it in inB }

        val sb = StringBuilder()
        sb.append("**").append(I18n.t("{count} members in both {first} and {second}", "count" to both.size, "first" to a.name, "second" to b.name)).append("**\n")
        sb.append(I18n.t("Only members the app has loaded are compared.")).append('\n')
        for (id in both.take(MAX_LISTED)) sb.append("<@").append(id).append(">\n")
        if (both.size > MAX_LISTED) sb.append(I18n.t("...and {count} more", "count" to both.size - MAX_LISTED))
        return sb.toString().trimEnd()
    }

    private companion object {
        const val MAX_LISTED = 50
    }
}
