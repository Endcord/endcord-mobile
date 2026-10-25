/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.notifycommon

import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.aliucord.wrappers.GuildRoleWrapper.Companion.name as roleName
import com.aliucord.wrappers.users.globalName
import com.discord.api.channel.Channel
import com.discord.api.presence.ClientStatus
import com.discord.models.domain.ModelUserRelationship
import com.discord.stores.NotificationTextUtils
import com.discord.stores.StoreStream
import com.discord.utilities.user.UserUtils
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.commandscommon.Avatars
import java.lang.reflect.Field
import java.util.regex.Matcher
import java.util.regex.Pattern
import com.discord.api.message.Message as ApiMessage
import com.discord.api.user.User as ApiUser
import com.discord.models.message.Message as ModelMessage

/** Questions the notification plugins ask about messages, channels and the user. */
internal object Msg {
    private const val DISCORD_EPOCH = 1420070400000L
    private const val TYPE_DM = 1
    private const val TYPE_GROUP_DM = 3

    /** The signed in user's id, or 0 before the connection is ready. */
    fun me(): Long = try {
        StoreStream.getUsers().me?.id ?: 0L
    } catch (_: Throwable) {
        0L
    }

    /** Creation time of a snowflake id. */
    fun timeOf(id: Long): Long = (id ushr 22) + DISCORD_EPOCH

    /**
     * Whether [message] was sent moments ago. Discord replays recent messages after a reconnect; like Discord's
     * own popups, plugins only react to messages younger than half a minute.
     */
    fun isFresh(message: ApiMessage): Boolean = System.currentTimeMillis() - timeOf(message.o()) < 30_000L

    fun authorId(message: ApiMessage): Long = message.e()?.id ?: 0L

    fun isOwn(message: ApiMessage): Boolean = authorId(message).let { it != 0L && it == me() }

    fun isBot(message: ApiMessage): Boolean = message.e()?.e() == true || message.G() != null

    /** Plain user messages and replies, not joins, pins, calls or other system messages. */
    fun isRegular(message: ApiMessage): Boolean = when (message.F() ?: 0) {
        0, 19 -> true
        else -> false
    }

    fun channel(id: Long): Channel? = StoreStream.getChannels().getChannel(id)

    fun isDm(channel: Channel): Boolean = channel.type == TYPE_DM

    fun isGroupDm(channel: Channel): Boolean = channel.type == TYPE_GROUP_DM

    fun isPrivate(channel: Channel): Boolean = channel.guildId == 0L

    /** The channel's own name, which DMs don't have. */
    fun rawName(channel: Channel): String = (channel.p() as String?).orEmpty()

    /** Whether the user is looking at [channelId] right now. */
    fun isViewing(channelId: Long): Boolean =
        !NotifyHooks.isBackgrounded && StoreStream.getChannelsSelected().id == channelId

    /** The user's own status, like [ClientStatus.DND]. */
    fun myStatus(): ClientStatus? = try {
        StoreStream.getPresences().localPresence?.status
    } catch (_: Throwable) {
        null
    }

    fun isFriend(userId: Long): Boolean = StoreStream.getUserRelationships().relationships[userId] == ModelUserRelationship.TYPE_FRIEND

    fun isBlocked(userId: Long): Boolean = StoreStream.getUserRelationships().relationships[userId] == ModelUserRelationship.TYPE_BLOCKED

    /** Whether the channel, its category or its server (or the DM) is muted. */
    fun isMuted(channel: Channel): Boolean = try {
        val settings = StoreStream.getUserGuildSettings().guildSettings[channel.guildId]
        settings != null && NotificationTextUtils.INSTANCE.isGuildOrCategoryOrChannelMuted(settings, channel)
    } catch (_: Throwable) {
        false
    }

    /**
     * The notification level that applies to [channel]: 0 all messages, 1 only mentions, 2 nothing, or null
     * when it isn't known.
     */
    fun notificationLevel(channel: Channel): Int? = try {
        val settings = StoreStream.getUserGuildSettings().guildSettings[channel.guildId]
        val guild = StoreStream.getGuilds().getGuild(channel.guildId)
        if (settings == null) guild?.defaultMessageNotifications
        else NotificationTextUtils.INSTANCE.channelMessageNotificationLevel(settings, channel, guild)
    } catch (_: Throwable) {
        null
    }

    /** Whether [message] mentions the user directly (not through @everyone or a role). */
    fun mentionsMe(message: ApiMessage): Boolean {
        val me = me()
        return message.t()?.any { it.id == me } == true
    }

    /** Whether [message] pings the user in any way: directly, @everyone/@here, or one of their roles. */
    fun pingsMe(message: ApiMessage, channel: Channel?): Boolean {
        if (mentionsMe(message)) return true
        if (message.r() == true) return true
        val roles = message.s()
        if (roles.isNullOrEmpty() || channel == null || channel.guildId == 0L) return false
        val member = StoreStream.getGuilds().getMember(channel.guildId, me()) ?: return false
        return member.roles.any { it in roles }
    }

    /** Name shown for a user: nickname in [guildId] if any, then display name, then username. */
    fun nameOf(userId: Long, guildId: Long = 0L, fallback: ApiUser? = null): String {
        if (guildId != 0L) {
            StoreStream.getGuilds().getMember(guildId, userId)?.nick?.takeIf { it.isNotBlank() }?.let { return it }
        }
        val user = StoreStream.getUsers().users[userId]
        if (user != null) return Common.displayName(user)
        if (fallback != null) return Common.displayName(fallback)
        return userId.toString()
    }

    /** Avatar URL of a cached user, or null. */
    fun avatarOf(userId: Long): String? {
        val user = StoreStream.getUsers().users[userId] ?: return null
        return Avatars.url(Avatars.AvatarOwner(user.id, user.avatar, user.discriminator), 128, true)
    }

    /** `#channel` (with the server) or the DM name, for notification titles. */
    fun placeOf(channel: Channel): String {
        if (channel.guildId == 0L) {
            return if (isGroupDm(channel)) Common.channelTitle(channel.id) else ""
        }
        val guild = StoreStream.getGuilds().getGuild(channel.guildId)?.name
        return "#${rawName(channel)}" + if (guild != null) " · $guild" else ""
    }

    private val userMention = Pattern.compile("<@!?(\\d{15,21})>")
    private val channelMention = Pattern.compile("<#(\\d{15,21})>")
    private val roleMention = Pattern.compile("<@&(\\d{15,21})>")
    private val customEmoji = Pattern.compile("<a?:(\\w+):\\d{15,21}>")
    private val timestamp = Pattern.compile("<t:(-?\\d{1,13})(?::[tTdDfFR])?>")

    /**
     * Message text with mentions, channels, roles and custom emojis spelled out the way Discord displays them,
     * shortened to [max] characters. Messages without text describe their attachments instead.
     */
    fun readable(message: ApiMessage, max: Int = 200): String {
        val channel = channel(message.g())
        val guildId = channel?.guildId ?: 0L
        var text = message.i().orEmpty()
        text = replace(userMention, text) { "@" + nameOf(it.group(1)!!.toLong(), guildId) }
        text = replace(channelMention, text) { m -> "#" + (channel(m.group(1)!!.toLong())?.let { rawName(it) } ?: "unknown") }
        text = replace(roleMention, text) { m ->
            val role = StoreStream.getGuilds().roles[guildId]?.get(m.group(1)!!.toLong())
            "@" + (role?.roleName ?: "role")
        }
        text = replace(customEmoji, text) { ":" + it.group(1) + ":" }
        text = replace(timestamp, text) { m ->
            val seconds = m.group(1)!!.toLongOrNull() ?: return@replace m.group()
            Common.formatTime(seconds * 1000L)
        }
        if (text.isBlank()) {
            val attachments = message.d()?.size ?: 0
            text = when {
                attachments > 0 -> I18n.t("Sent an attachment")
                !message.A().isNullOrEmpty() || !message.B().isNullOrEmpty() -> I18n.t("Sent a sticker")
                !message.k().isNullOrEmpty() -> I18n.t("Sent an embed")
                else -> ""
            }
        }
        return Common.preview(text, max)
    }

    private inline fun replace(pattern: Pattern, text: String, transform: (Matcher) -> String): String {
        if (text.isEmpty()) return text
        val matcher = pattern.matcher(text)
        if (!matcher.find()) return text
        val out = StringBuffer()
        do {
            val replacement = try {
                transform(matcher)
            } catch (_: Throwable) {
                matcher.group()
            }
            matcher.appendReplacement(out, Matcher.quoteReplacement(replacement))
        } while (matcher.find())
        matcher.appendTail(out)
        return out.toString()
    }

    // ---- changing mentions ----

    private val apiMentions = field(ApiMessage::class.java, "mentions")
    private val apiEveryone = field(ApiMessage::class.java, "mentionEveryone")
    private val apiRoles = field(ApiMessage::class.java, "mentionRoles")
    private val modelMentions = field(ModelMessage::class.java, "mentions")
    private val modelEveryone = field(ModelMessage::class.java, "mentionEveryone")
    private val modelRoles = field(ModelMessage::class.java, "mentionRoles")

    private fun field(owner: Class<*>, name: String): Field? = try {
        owner.getDeclaredField(name).apply { isAccessible = true }
    } catch (_: Throwable) {
        null
    }

    @Suppress("UNCHECKED_CAST")
    private fun mentionsOf(target: Any): List<ApiUser>? =
        (if (target is ApiMessage) apiMentions else modelMentions)?.get(target) as List<ApiUser>?

    /** Adds the user to the mentions of an api or stored message, so Discord treats it as a ping. */
    fun addMeToMentions(target: Any) {
        val me = StoreStream.getUsers().me ?: return
        val current = mentionsOf(target).orEmpty()
        if (current.any { it.id == me.id }) return
        val self = try {
            UserUtils.INSTANCE.synthesizeApiUser(me)
        } catch (_: Throwable) {
            null
        } ?: return
        val field = if (target is ApiMessage) apiMentions else modelMentions
        field?.set(target, ArrayList(current).apply { add(self) })
    }

    /** Removes every ping from an api or stored message: users, roles, @everyone and @here. */
    fun clearMentions(target: Any) {
        val isApi = target is ApiMessage
        (if (isApi) apiMentions else modelMentions)?.set(target, ArrayList<ApiUser>())
        (if (isApi) apiRoles else modelRoles)?.set(target, ArrayList<Long>())
        (if (isApi) apiEveryone else modelEveryone)?.set(target, false)
    }

    /** Display name of an api user, for code that only has the message's author. */
    fun apiName(user: ApiUser?): String {
        if (user == null) return ""
        val global = try {
            user.globalName
        } catch (_: Throwable) {
            null
        }
        return if (global.isNullOrBlank()) user.username else global
    }
}
