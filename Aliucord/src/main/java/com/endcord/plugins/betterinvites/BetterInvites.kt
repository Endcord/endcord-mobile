/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.betterinvites

import android.content.Context
import android.text.format.DateUtils
import android.widget.TextView
import com.aliucord.Http
import com.aliucord.Utils
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.aliucord.wrappers.GuildWrapper.Companion.features
import com.aliucord.wrappers.GuildWrapper.Companion.id
import com.aliucord.wrappers.GuildWrapper.Companion.name
import com.aliucord.wrappers.users.globalName
import com.discord.api.guild.GuildFeature
import com.discord.api.user.User
import com.discord.databinding.WidgetChatListAdapterItemInviteBinding
import com.discord.stores.StoreStream
import com.discord.utilities.time.TimeUtils
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemInvite
import com.endcord.plugins.commandscommon.Net
import com.endcord.plugins.guildsbcommon.GuildsBPlugin
import com.endcord.plugins.userscommon.UserSheets
import com.endcord.plugins.userscommon.Users
import org.json.JSONObject
import java.lang.reflect.Field
import java.util.WeakHashMap
import java.util.concurrent.ConcurrentHashMap

/**
 * Invite embeds in chat (`WidgetChatListAdapterItemInvite`):
 * * the header names who sent the invite ("Alice invited you to Server"), tap it to open their profile;
 * * a second line says when the invite expires. The legacy invite model drops `expires_at`, so it's fetched once
 *   per invite code in the background and cached;
 * * tapping the server name of a discoverable server you aren't in opens a preview (lurking), like on PC.
 */
internal class BetterInvites : GuildsBPlugin(
    name = "BetterInvites",
    description = "See invites expiration date, view inviter profile and preview servers before joining by clicking the name",
) {
    override val tags = listOf("appearance", "customisation", "chat", "servers")

    private val bindingField: Field by lazy {
        WidgetChatListAdapterItemInvite::class.java.getDeclaredField("binding").apply { isAccessible = true }
    }

    /** Invite code -> expiry in ms, or [NEVER]. */
    private val expiries = ConcurrentHashMap<String, Long>()
    private val fetching = ConcurrentHashMap.newKeySet<String>()

    /** Header views and the invite they currently show, to fill in the expiry once it's known. Main thread only. */
    private val headers = WeakHashMap<TextView, Shown>()

    private class Shown(val code: String, val title: String)

    override fun start(context: Context) {
        patcher.after<WidgetChatListAdapterItemInvite>(
            "configureResolvedUI", WidgetChatListAdapterItemInvite.Model.Resolved::class.java,
        ) { param ->
            try {
                val model = param.args[0] as WidgetChatListAdapterItemInvite.Model.Resolved
                val binding = bindingField.get(this) as? WidgetChatListAdapterItemInviteBinding ?: return@after
                decorate(binding, model)
            } catch (e: Throwable) {
                logger.error("Failed to decorate an invite", e)
            }
        }
    }

    private fun decorate(binding: WidgetChatListAdapterItemInviteBinding, model: WidgetChatListAdapterItemInvite.Model.Resolved) {
        val invite = model.invite ?: return
        val guild = invite.guild
        val header = binding.c
        val nameView = binding.m

        // Header: who sent the invite, tap to open their profile
        val inviter = invite.inviter
        val guildName = guild?.name
        val title = when {
            inviter == null || guildName == null -> null
            inviter.id == model.meId -> I18n.t("You sent an invite to join {guild}", "guild" to guildName)
            else -> I18n.t("{user} invited you to {guild}", "user" to displayName(inviter), "guild" to guildName)
        }
        if (title != null) {
            header.setOnClickListener { v ->
                try {
                    UserSheets.show(inviter!!.id, guild?.id, Users.activityOf(v.context).supportFragmentManager)
                } catch (e: Throwable) {
                    logger.error("Failed to open the inviter's profile", e)
                }
            }
        } else {
            header.setOnClickListener(null)
            header.isClickable = false
        }

        val code = invite.code
        if (code != null) {
            val shown = Shown(code, title ?: header.text?.toString().orEmpty())
            headers[header] = shown
            render(header, shown)
            if (!expiries.containsKey(code)) fetchExpiry(code)
        } else {
            headers.remove(header)
            if (title != null) header.text = title
        }

        // Server name: preview servers you can lurk in
        val lurkable = guild != null && !model.isMemberOfGuild &&
            guild.features?.contains(GuildFeature.DISCOVERABLE) == true
        if (lurkable) {
            val guildId = guild!!.id
            val channelId = model.channel?.id ?: invite.channel?.id
            nameView.setOnClickListener { v ->
                try {
                    StoreStream.getLurking().startLurkingAndNavigate(guildId, channelId, v.context)
                } catch (e: Throwable) {
                    logger.errorToast(I18n.t("This server can't be previewed"), e)
                }
            }
        } else {
            nameView.setOnClickListener(null)
            nameView.isClickable = false
        }
    }

    private fun render(header: TextView, shown: Shown) {
        val expiry = expiries[shown.code]
        val line = when {
            expiry == null || expiry == UNKNOWN -> null
            expiry == NEVER -> I18n.t("This invite will not expire")
            else -> I18n.t(
                "This invite will expire {time}",
                "time" to DateUtils.getRelativeTimeSpanString(expiry, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString(),
            )
        }
        if (line != null && header.maxLines < 3) header.maxLines = 3
        header.text = if (line == null) shown.title else "${shown.title}\n$line"
    }

    private fun fetchExpiry(code: String) {
        if (!fetching.add(code)) return
        Utils.threadPool.execute {
            try {
                val json = JSONObject(Net.text(
                    Http.Request.newDiscordRNRequest("/invites/${Net.encodeURIComponent(code)}?with_counts=false&with_expiration=true"),
                ))
                val raw = if (json.isNull("expires_at")) null else json.optString("expires_at").takeIf { it.isNotEmpty() }
                val expiry = if (raw == null) NEVER else TimeUtils.parseUTCDate(raw)
                expiries[code] = expiry
                Utils.mainThread.post {
                    for (entry in ArrayList(headers.entries)) {
                        val view = entry.key ?: continue
                        if (entry.value.code == code) render(view, entry.value)
                    }
                }
            } catch (e: Throwable) {
                expiries[code] = UNKNOWN // don't ask again for an invite that failed (expired, invalid...)
                logger.error("Failed to load the expiry of invite $code", e)
            } finally {
                fetching.remove(code)
            }
        }
    }

    private fun displayName(user: User): String {
        val global = try {
            user.globalName
        } catch (_: Throwable) {
            null
        }
        return if (global.isNullOrBlank()) user.username else global
    }

    override fun stop(context: Context) {
        super.stop(context)
        headers.clear()
    }

    private companion object {
        const val NEVER = -1L
        const val UNKNOWN = -2L
    }
}
