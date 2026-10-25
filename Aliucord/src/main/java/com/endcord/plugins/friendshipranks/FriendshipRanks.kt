/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.friendshipranks

import android.content.Context
import android.text.SpannableStringBuilder
import com.aliucord.Http
import com.aliucord.PluginManager
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.utils.accessField
import com.discord.api.user.UserProfile
import com.discord.databinding.UserProfileHeaderBadgeBinding
import com.discord.models.domain.ModelUserRelationship
import com.discord.models.user.User
import com.discord.stores.StoreStream
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.discord.widgets.user.Badge
import com.discord.widgets.user.profile.UserProfileHeaderView
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.identitycommon.Header
import com.endcord.plugins.identitycommon.Icons
import com.endcord.plugins.identitycommon.RemoteImages
import com.lytefast.flexinput.R
import org.json.JSONArray
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

private val UserProfileHeaderView.BadgeViewHolder.badgeBinding by accessField<UserProfileHeaderBadgeBinding>("binding")

/**
 * The legacy app's relationships don't carry the date a friendship started, so it is read once per start from
 * Discord's relationships endpoint, which does. Friends added later get their rank after the next start.
 */
internal class FriendshipRanks : EndcordPlugin(
    name = "FriendshipRanks",
    description = "Adds badges showcasing how long you have been friends with a user for",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("friends")

    override val settingsSchema = listOf(
        PluginSetting.Switch("showFriendsInChat", "Show a friend icon on messages from friends."),
    )

    private class Rank(val title: String, val description: String, val requirement: Double, val iconUrl: String)

    private val ranks = listOf(
        Rank("Sprout", "Your friendship is just starting", 0.0, "$ICONS/sprout.png"),
        Rank("Blooming", "Your friendship is getting there! (1 Month)", 30.0, "$ICONS/blooming.png"),
        Rank("Burning", "Your friendship has reached terminal velocity (3 Months)", 90.0, "$ICONS/burning.png"),
        Rank("Fighter", "Your friendship is strong (6 Months)", 182.5, "$ICONS/fighter.png"),
        Rank("Star", "Your friendship has been going on for a WHILE (1 Year)", 365.0, "$ICONS/star.png"),
        Rank("Royal", "Your friendship has gone through thick and thin- a whole 2 years!", 730.0, "$ICONS/royal.png"),
        Rank("Besties", "How do you even manage this??? (5 Years)", 1826.25, "$ICONS/besties.png"),
    )

    /** Friend id -> when the friendship started, in milliseconds. */
    @Volatile
    private var friendsSince: Map<Long, Long> = emptyMap()

    private fun loadFriendships() {
        Utils.threadPool.execute {
            try {
                val req = Http.Request.newDiscordRNRequest("/users/@me/relationships").setRequestTimeout(20_000)
                val body = try {
                    val res = req.execute()
                    if (!res.ok()) throw IllegalStateException("HTTP ${res.statusCode}")
                    res.text()
                } finally {
                    req.close()
                }
                val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
                val result = HashMap<Long, Long>()
                val array = JSONArray(body)
                for (i in 0 until array.length()) {
                    val rel = array.optJSONObject(i) ?: continue
                    if (rel.optInt("type") != ModelUserRelationship.TYPE_FRIEND) continue
                    val id = rel.optString("id").toLongOrNull() ?: continue
                    val since = rel.optString("since").takeIf { it.length >= 19 } ?: continue
                    val millis = try {
                        parser.parse(since.substring(0, 19))?.time
                    } catch (e: Throwable) {
                        null
                    } ?: continue
                    result[id] = millis
                }
                friendsSince = result
            } catch (e: Throwable) {
                logger.warn("Couldn't load friendship dates: ${e.message}", null)
            }
        }
    }

    private fun isFriend(userId: Long): Boolean =
        StoreStream.getUserRelationships().relationships[userId] == ModelUserRelationship.TYPE_FRIEND

    /** Port of shouldShowBadge: the rank whose range contains the friendship's age in days. */
    private fun rankOf(userId: Long): Rank? {
        if (!isFriend(userId)) return null
        val since = friendsSince[userId] ?: return null
        val days = Math.floor((System.currentTimeMillis() - since) / 86_400_000.0)
        for (i in ranks.indices) {
            val next = ranks.getOrNull(i + 1)
            if (days > ranks[i].requirement && (next == null || days < next.requirement)) return ranks[i]
        }
        return null
    }

    private val decorator = object : ChatDecorator(name, priority = 61) {
        override fun afterConfigure(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry) {
            if (!bool("showFriendsInChat")) return
            val author = entry.message.author ?: return
            if (!isFriend(author.id)) return
            val view = Header.timestamp(holder) ?: return
            val builder = SpannableStringBuilder()
            if (!Icons.append(builder, view, R.e.ic_tab_friends, view.currentTextColor, 1.1f)) return
            Header.prepend(holder, builder.append(' '))
        }
    }

    override fun start(context: Context) {
        loadFriendships()
        ChatHooks.register(decorator)

        patcher.after<Badge.Companion>(
            "getBadgesForUser",
            User::class.java,
            UserProfile::class.java,
            Boolean::class.javaPrimitiveType!!,
            Boolean::class.javaPrimitiveType!!,
            Context::class.java,
        ) { param ->
            try {
                val user = param.args[0] as User? ?: return@after
                val rank = rankOf(user.id) ?: return@after
                @Suppress("UNCHECKED_CAST")
                val badges = (param.result as List<Badge>?).orEmpty()
                val tooltip = "${I18n.t(rank.title)}: ${I18n.t(rank.description)}"
                param.result = badges + Badge(0, null, tooltip, false, rank.iconUrl)
            } catch (e: Throwable) {
                logger.error("Failed to add the friendship rank badge", e)
            }
        }

        // The Badges core plugin loads remote badge icons; do it here when it's turned off
        patcher.after<UserProfileHeaderView.BadgeViewHolder>("bind", Badge::class.java) { param ->
            try {
                val badge = param.args[0] as Badge
                val url = badge.objectType ?: return@after
                if (badge.icon != 0 || !url.startsWith(ICONS) || PluginManager.isPluginEnabled("Badges")) return@after
                RemoteImages.into(badgeBinding.b, url)
            } catch (e: Throwable) {
                logger.error("Failed to show a friendship rank badge", e)
            }
        }
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        super.stop(context)
    }

    private companion object {
        const val ICONS = "https://equicord.org/assets/plugins/friendshipRanks"
    }
}
