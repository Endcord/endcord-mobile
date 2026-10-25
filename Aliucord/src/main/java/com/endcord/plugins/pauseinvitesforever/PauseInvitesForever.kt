/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.pauseinvitesforever

import android.content.Context
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.FragmentActivity
import com.aliucord.Http
import com.aliucord.Utils
import com.aliucord.i18n.I18n
import com.discord.models.guild.Guild
import com.discord.stores.StoreStream
import com.discord.utilities.permissions.PermissionUtils
import com.endcord.plugins.commandscommon.Net
import com.endcord.plugins.guildsbcommon.GuildsBPlugin
import com.endcord.plugins.guildscommon.GuildMenuActions
import com.lytefast.flexinput.R
import org.json.JSONArray
import org.json.JSONObject

/**
 * The legacy app has no way to pause invites at all, and its guild model drops the `INVITES_DISABLED` feature.
 * "Pause Invites" in the server long-press menu (for members with Manage Server) reads the server's features,
 * then pauses invites indefinitely by adding `INVITES_DISABLED`, the same request Endcord PC sends, or resumes
 * them when they are already paused.
 */
internal class PauseInvitesForever : GuildsBPlugin(
    name = "PauseInvitesForever",
    description = "Brings back the option to pause invites indefinitely that stupit Discord removed.",
) {
    override val tags = listOf("servers")

    override fun start(context: Context) {
        GuildMenuActions.register(name, { "Pause Invites" }, R.e.ic_guild_invite_24dp, { canManage(it) }) { ctx ->
            prompt(ctx.guild, ctx.activity)
        }
    }

    private fun canManage(guild: Guild): Boolean {
        val perms = StoreStream.getPermissions().guildPermissions[guild.id] ?: return false
        return PermissionUtils.can(MANAGE_GUILD, perms)
    }

    /** Loads the server's current features, then asks whether to pause or resume invites. */
    private fun prompt(guild: Guild, activity: FragmentActivity) {
        val guildId = guild.id
        val guildName = guild.name
        Utils.threadPool.execute {
            try {
                val json = JSONObject(Net.text(Http.Request.newDiscordRNRequest("/guilds/$guildId")))
                val features = json.optJSONArray("features") ?: JSONArray()
                val list = ArrayList<String>(features.length())
                for (i in 0 until features.length()) list += features.getString(i)
                val paused = INVITES_DISABLED in list
                Utils.mainThread.post { ask(activity, guildId, guildName, list, paused) }
            } catch (e: Throwable) {
                logger.errorToast(I18n.t("Couldn't load the server's invite settings: {error}", "error" to Net.describe(e)), e)
            }
        }
    }

    private fun ask(activity: FragmentActivity, guildId: Long, guildName: String, features: List<String>, paused: Boolean) {
        if (activity.isFinishing || activity.isDestroyed) return
        val builder = AlertDialog.Builder(activity)
        if (paused) {
            builder.setTitle(I18n.t("Invites are paused"))
                .setMessage(I18n.t("Nobody can join {server} with an invite right now. Resume invites?", "server" to guildName))
                .setPositiveButton(I18n.t("Resume Invites")) { _, _ -> save(guildId, features - INVITES_DISABLED, false) }
        } else {
            builder.setTitle(I18n.t("Pause Invites"))
                .setMessage(I18n.t(
                    "Pause invites to {server} indefinitely? Nobody will be able to join with an invite until you resume them here.",
                    "server" to guildName,
                ))
                .setPositiveButton(I18n.t("Pause Indefinitely.")) { _, _ -> save(guildId, features + INVITES_DISABLED, true) }
        }
        try {
            builder.setNegativeButton(I18n.t("Cancel"), null).show()
        } catch (e: Throwable) {
            // The activity was recreated while the server was loading
            logger.error("Failed to show the invite dialog", e)
        }
    }

    private fun save(guildId: Long, features: List<String>, pause: Boolean) {
        Utils.threadPool.execute {
            try {
                val body = JSONObject().put("features", JSONArray(features)).toString()
                Net.text(Http.Request.newDiscordRNRequest("/guilds/$guildId", "PATCH"), body)
                Utils.showToast(I18n.t(if (pause) "Invites paused" else "Invites resumed"))
            } catch (e: Throwable) {
                logger.errorToast(I18n.t("Couldn't change the server's invites: {error}", "error" to Net.describe(e)), e)
            }
        }
    }

    private companion object {
        const val MANAGE_GUILD = 1L shl 5
        const val INVITES_DISABLED = "INVITES_DISABLED"
    }
}
