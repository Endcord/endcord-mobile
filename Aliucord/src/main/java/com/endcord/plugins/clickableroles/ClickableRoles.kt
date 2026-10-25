/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.clickableroles

import android.content.Context
import androidx.fragment.app.FragmentActivity
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.aliucord.utils.RxUtils.await
import com.aliucord.wrappers.GuildRoleWrapper.Companion.name
import com.discord.stores.StoreStream
import com.discord.utilities.rest.RestAPI
import com.endcord.plugins.commandscommon.Dialogs
import com.endcord.plugins.userscommon.RoleChips
import com.endcord.plugins.userscommon.UserSheets
import com.endcord.plugins.userscommon.Users
import java.util.concurrent.ConcurrentHashMap

internal class ClickableRoles : EndcordPlugin(
    name = "ClickableRoles",
    description = "Tap on roles in user profiles to see which members have them.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("roles", "profiles")

    private class CachedIds(val ids: List<Long>, val time: Long)

    private val cache = ConcurrentHashMap<String, CachedIds>()

    override fun start(context: Context) {
        RoleChips.register(name, onClick = { chip ->
            showMembers(Users.activityOf(chip.view.context), chip.guildId, chip.role.id, chip.role.name)
        })
    }

    override fun stop(context: Context) {
        RoleChips.unregisterAll(name)
        cache.clear()
        super.stop(context)
    }

    private fun showMembers(activity: FragmentActivity, guildId: Long, roleId: Long, roleName: String) {
        Utils.showToast(I18n.t("Loading members..."))
        Utils.threadPool.execute {
            val ids = memberIds(guildId, roleId)
            val missing = ids.take(MAX_SHOWN).filter { StoreStream.getUsers().users[it] == null }
            if (missing.isNotEmpty()) {
                // Ask the gateway for the members we don't know yet and give it a moment to answer
                try {
                    StoreStream.getGatewaySocket().requestGuildMembers(guildId, null, missing, null)
                    var waited = 0
                    while (waited < 2000 && missing.any { StoreStream.getUsers().users[it] == null }) {
                        Thread.sleep(200)
                        waited += 200
                    }
                } catch (e: Throwable) {
                    logger.error("Failed to request role members", e)
                }
            }
            Utils.mainThread.post { showList(activity, guildId, roleName, ids) }
        }
    }

    /** Ids of the members with a role, from Discord's API with a short cache, or the members the app has loaded. */
    private fun memberIds(guildId: Long, roleId: Long): List<Long> {
        val key = "$guildId-$roleId"
        cache[key]?.let { if (System.currentTimeMillis() - it.time < CACHE_TTL) return it.ids }
        val fetched = try {
            val (ids, error) = RestAPI.getApi().getGuildRoleMemberIds(guildId, roleId).await()
            if (error != null) logger.warn("Failed to fetch role members: ${error.message}")
            ids
        } catch (e: Throwable) {
            logger.warn("Failed to fetch role members: ${e.message}")
            null
        }
        val ids = if (!fetched.isNullOrEmpty()) fetched else cachedMemberIds(guildId, roleId)
        cache[key] = CachedIds(ids, System.currentTimeMillis())
        return ids
    }

    private fun cachedMemberIds(guildId: Long, roleId: Long): List<Long> {
        val members = StoreStream.getGuilds().members[guildId]?.values ?: return emptyList()
        return if (roleId == guildId) members.map { it.userId }
        else members.filter { it.roles?.contains(roleId) == true }.map { it.userId }
    }

    private fun showList(activity: FragmentActivity, guildId: Long, roleName: String, ids: List<Long>) {
        if (activity.isFinishing) return
        val title = "@$roleName (${ids.size})"
        if (ids.isEmpty()) {
            Dialogs.showText(activity, title, I18n.t("No members found."))
            return
        }
        val shown = ids.take(MAX_SHOWN)
            .map { id -> id to Users.displayName(id) }
            .sortedBy { it.second.lowercase() }
        val labels = shown.map { it.second as CharSequence }.toMutableList()
        if (ids.size > shown.size) labels.add(I18n.t("and {count} more", "count" to ids.size - shown.size))
        Dialogs.showList(activity, title, labels) { index ->
            if (index < shown.size) UserSheets.show(shown[index].first, guildId, activity.supportFragmentManager)
        }
    }

    private companion object {
        const val MAX_SHOWN = 100
        const val CACHE_TTL = 60_000L
    }
}
