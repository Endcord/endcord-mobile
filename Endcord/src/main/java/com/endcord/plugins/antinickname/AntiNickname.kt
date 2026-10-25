/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.antinickname

import android.content.Context
import com.aliucord.Http
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.patcher.before
import com.discord.api.guildmember.GuildMember
import com.discord.api.guildmember.PatchGuildMemberBody
import com.discord.restapi.RestAPIParams
import com.discord.stores.StoreStream
import com.discord.utilities.rest.RestAPI
import com.endcord.plugins.commandscommon.Net
import java.lang.reflect.Field

/**
 * Clears a nickname someone else set on the user, as soon as the gateway reports it.
 *
 * Unlike Endcord PC this only uses the regular "change your own nickname" route, so it only acts in servers where
 * the user has the Change Nickname permission (or owns the server / is an administrator), and it never retries
 * a failed reset. Nicknames the user sets from this app are remembered and left alone. Resets are rate limited:
 * if a server keeps renaming the user, the plugin gives up on that server until the app restarts.
 */
internal class AntiNickname : EndcordPlugin(
    name = "AntiNickname",
    description = DESCRIPTION,
    authors = arrayOf("vpg"),
) {
    override val tags = listOf("servers", "profile")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            key = "showToast",
            label = "Show a notification when a forced nickname is removed",
            default = true,
        ),
        PluginSetting.Text(
            key = "ignoredServers",
            label = "Servers to leave alone",
            description = "Server IDs, one per line. Nicknames you are given there are kept, for example ones you set yourself from another device.",
            multiline = true,
        ),
    )

    private val lock = Any()

    /** Nickname the user picked themselves from this app, by server. */
    private val ownNicks = HashMap<Long, String>()

    /** When each server's recent resets happened, for the rate limit. */
    private val recentResets = HashMap<Long, MutableList<Long>>()

    /** Servers where a reset is in flight, failed, or was rate limited. Cleared on restart. */
    private val pending = HashSet<Long>()
    private val stopped = HashSet<Long>()
    private val warnedNoPermission = HashSet<Long>()

    /** Set after Discord answers 429, so nothing else is sent this session. */
    @Volatile
    private var rateLimited = false

    @Volatile
    private var active = false

    override fun start(context: Context) {
        active = true
        // Runs on the store thread before the stores apply GUILD_MEMBER_ADD / GUILD_MEMBER_UPDATE
        patcher.before<StoreStream>("handleGuildMemberAdd", GuildMember::class.java) { param ->
            try {
                onMemberUpdate(param.args[0] as GuildMember)
            } catch (e: Throwable) {
                logger.error("Failed to check a member update", e)
            }
        }

        // The ways this app changes the user's own nickname, so those changes are kept
        patcher.before<RestAPI>("changeGuildNickname", Long::class.javaPrimitiveType!!, RestAPIParams.Nick::class.java) { param ->
            remember(param.args[0] as Long, read(nickParamField, param.args[1]))
        }
        patcher.before<RestAPI>("updateMeGuildMember", Long::class.javaPrimitiveType!!, PatchGuildMemberBody::class.java) { param ->
            remember(param.args[0] as Long, read(patchBodyNickField, param.args[1]))
        }
        patcher.before<RestAPI>(
            "changeGuildMember",
            Long::class.javaPrimitiveType!!,
            Long::class.javaPrimitiveType!!,
            RestAPIParams.GuildMember::class.java,
        ) { param ->
            if (param.args[1] as Long == myId()) remember(param.args[0] as Long, read(memberParamsNickField, param.args[2]))
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        synchronized(lock) {
            ownNicks.clear()
            recentResets.clear()
            pending.clear()
            stopped.clear()
            warnedNoPermission.clear()
        }
        rateLimited = false
        active = false
    }

    private fun myId(): Long = try {
        StoreStream.getUsers().me.id
    } catch (_: Throwable) {
        0L
    }

    private fun read(field: Field?, target: Any?): String? = try {
        if (target == null) null else field?.get(target) as String?
    } catch (_: Throwable) {
        null
    }

    private fun remember(guildId: Long, nick: String?) {
        // Null means the request doesn't touch the nickname
        if (nick == null) return
        synchronized(lock) { ownNicks[guildId] = nick }
    }

    private fun onMemberUpdate(member: GuildMember) {
        val me = myId()
        if (me == 0L || rateLimited) return
        val userId = member.n() ?: member.m()?.id ?: return
        if (userId != me) return

        val guildId = member.f()
        val nick = member.h()
        if (nick.isNullOrEmpty()) return

        // Only react to a change: member updates also arrive for role changes, boosts and so on
        val previous = StoreStream.getGuilds().getMember(guildId, me) ?: return
        if (previous.nick == nick) return
        if (guildId.toString() in list("ignoredServers")) return

        synchronized(lock) {
            if (ownNicks[guildId] == nick) return
            if (guildId in stopped || !pending.add(guildId)) return
        }

        if (!canChangeOwnNickname(guildId, me)) {
            val firstTime = synchronized(lock) {
                pending.remove(guildId)
                warnedNoPermission.add(guildId)
            }
            if (firstTime && bool("showToast")) {
                Utils.showToast(I18n.t("AntiNickname: you aren't allowed to change your nickname in {server}", "server" to serverName(guildId)))
            }
            return
        }

        // Give the stores a moment, like Endcord PC does, then send the reset off the store thread
        Utils.mainThread.postDelayed({ Utils.threadPool.execute { reset(guildId, nick) } }, RESET_DELAY_MS)
    }

    private fun canChangeOwnNickname(guildId: Long, me: Long): Boolean {
        val guild = StoreStream.getGuilds().getGuild(guildId)
        if (guild != null && guild.ownerId == me) return true
        val permissions = StoreStream.getPermissions().guildPermissions[guildId] ?: return false
        return permissions and (CHANGE_NICKNAME or ADMINISTRATOR) != 0L
    }

    private fun reset(guildId: Long, forcedNick: String) {
        // Turned off while the reset was waiting
        if (!active || rateLimited) {
            synchronized(lock) { pending.remove(guildId) }
            return
        }
        val now = System.currentTimeMillis()
        val allowed = synchronized(lock) {
            val times = recentResets.getOrPut(guildId) { ArrayList() }
            times.removeAll { now - it > RATE_WINDOW_MS }
            if (times.size >= MAX_RESETS_PER_WINDOW) {
                stopped.add(guildId)
                pending.remove(guildId)
                false
            } else {
                times.add(now)
                true
            }
        }
        if (!allowed) {
            if (bool("showToast")) {
                Utils.showToast(
                    I18n.t("AntiNickname: your nickname in {server} keeps being changed, so it is no longer reset there until you restart the app", "server" to serverName(guildId)),
                    true,
                )
            }
            return
        }

        try {
            Net.text(Http.Request.newDiscordRNRequest("/guilds/$guildId/members/@me", "PATCH"), "{\"nick\":\"\"}")
            if (bool("showToast")) {
                Utils.showToast(I18n.t("AntiNickname: nickname \"{nick}\" removed", "nick" to forcedNick))
            }
        } catch (e: Throwable) {
            logger.error("Failed to reset nickname in $guildId", e)
            synchronized(lock) { stopped.add(guildId) }
            if (e is Net.HttpError && e.status == 429) rateLimited = true
            if (bool("showToast")) {
                Utils.showToast(I18n.t("AntiNickname: failed to reset nickname ({error})", "error" to Net.describe(e)), true)
            }
        } finally {
            synchronized(lock) { pending.remove(guildId) }
        }
    }

    private fun serverName(guildId: Long): String =
        StoreStream.getGuilds().getGuild(guildId)?.name ?: guildId.toString()

    private companion object {
        const val DESCRIPTION =
            "Automatically resets any nickname forcefully assigned to you in a server, where you are allowed to change your own nickname."

        const val ADMINISTRATOR = 1L shl 3
        const val CHANGE_NICKNAME = 1L shl 26

        const val RESET_DELAY_MS = 1_000L
        const val RATE_WINDOW_MS = 10 * 60 * 1000L
        const val MAX_RESETS_PER_WINDOW = 3

        val nickParamField: Field? by lazy { field(RestAPIParams.Nick::class.java) }
        val patchBodyNickField: Field? by lazy { field(PatchGuildMemberBody::class.java) }
        val memberParamsNickField: Field? by lazy { field(RestAPIParams.GuildMember::class.java) }

        fun field(clazz: Class<*>): Field? = try {
            clazz.getDeclaredField("nick").apply { isAccessible = true }
        } catch (_: Throwable) {
            null
        }
    }
}
