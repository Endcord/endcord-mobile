/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.friendinvites

import android.content.Context
import com.aliucord.Http
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.tr
import com.endcord.plugins.commandscommon.Net
import com.endcord.plugins.commandscommon.Options
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

internal class FriendInvites : EndcordPlugin(
    name = "FriendInvites",
    description = "Create and manage friend invite links via slash commands (/friendinvites create, /friendinvites view, /friendinvites revoke).",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("friends", "commands")

    override fun start(context: Context) {
        // The legacy app can't run commands whose name has spaces, so PC's three commands are subcommands here
        commands.registerCommand(
            "friendinvites",
            "Create and manage friend invite links",
            listOf(
                Options.subcommand("create", "Generates a friend invite link."),
                Options.subcommand("view", "View a list of all generated friend invites."),
                Options.subcommand("revoke", "Revokes all generated friend invites."),
            ),
        ) { ctx ->
            val content = when {
                ctx.containsArg("create") -> create()
                ctx.containsArg("revoke") -> revoke()
                else -> view()
            }
            CommandResult(content, null, false)
        }
    }

    // These run on the command thread, so blocking on the network is fine.

    private fun create(): String = try {
        val invite = JSONObject(Net.text(Http.Request.newDiscordRequest(ROUTE, "POST"), "{}"))
        listOfNotNull(
            "discord.gg/${invite.getString("code")}",
            expires(invite)?.let { tr("Expires: {time}", "time" to it) },
            tr("Max uses: {count}", "count" to "`${invite.optInt("max_uses")}`"),
        ).joinToString(" · ")
    } catch (e: Throwable) {
        logger.warn("Failed to create a friend invite", e)
        tr("Couldn't create a friend invite: {error}", "error" to Net.describe(e))
    }

    private fun view(): String = try {
        val invites = JSONArray(Net.text(Http.Request.newDiscordRequest(ROUTE)))
        (0 until invites.length()).joinToString("\n") { i ->
            val invite = invites.getJSONObject(i)
            listOfNotNull(
                "_discord.gg/${invite.getString("code")}_",
                expires(invite)?.let { tr("Expires: {time}", "time" to it) },
                tr("Times used: {count}", "count" to "`${invite.optInt("uses")}/${invite.optInt("max_uses")}`"),
            ).joinToString(" · ")
        }.ifEmpty { tr("You have no active friend invites!") }
    } catch (e: Throwable) {
        logger.warn("Failed to load friend invites", e)
        tr("Couldn't load your friend invites: {error}", "error" to Net.describe(e))
    }

    private fun revoke(): String = try {
        Net.text(Http.Request.newDiscordRequest(ROUTE, "DELETE"))
        tr("All friend invites have been revoked.")
    } catch (e: Throwable) {
        logger.warn("Failed to revoke friend invites", e)
        tr("Couldn't revoke your friend invites: {error}", "error" to Net.describe(e))
    }

    /** A relative Discord timestamp for the invite's expiry, or null when it doesn't expire. */
    private fun expires(invite: JSONObject): String? {
        val raw = invite.optString("expires_at").takeIf { it.length >= 19 && it != "null" } ?: return null
        return try {
            // Discord sends UTC ISO 8601 ("2026-11-01T12:00:00.000000+00:00"). java.time isn't desugared in the
            // core and needs API 26, so parse the seconds part by hand.
            val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.ROOT).apply { timeZone = TimeZone.getTimeZone("UTC") }
            val millis = format.parse(raw.substring(0, 19))?.time ?: return null
            "<t:${millis / 1000}:R>"
        } catch (_: Throwable) {
            null
        }
    }

    private companion object {
        const val ROUTE = "/users/@me/invites"
    }
}
