/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.moreusertags

import android.content.Context
import android.os.SystemClock
import android.view.View
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.parentId
import com.aliucord.wrappers.ChannelWrapper.Companion.permissionOverwrites
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.discord.api.permission.PermissionOverwrite
import com.discord.models.message.Message
import com.discord.stores.StoreStream
import com.discord.utilities.permissions.PermissionUtils
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.identitycommon.Header
import com.endcord.plugins.identitycommon.Members
import java.util.Locale

internal class MoreUserTags : EndcordPlugin(
    name = "MoreUserTags",
    description = "Adds tags for webhooks and moderative roles (owner, admin, etc.)",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "chat")

    /** One of Endcord PC's tags: a key, the text on the tag and when it applies. */
    private class Tag(val key: String, val displayName: String, val description: String, val permissions: Long)

    private val tagList = listOf(
        Tag("WEBHOOK", "Webhook", "Messages sent by webhooks", 0L),
        Tag("OWNER", "Owner", "Owns the server", 0L),
        Tag("ADMINISTRATOR", "Admin", "Has the administrator permission", ADMINISTRATOR),
        Tag("MODERATOR_STAFF", "Staff", "Can manage the server, channels or roles", MANAGE_GUILD or MANAGE_CHANNELS or MANAGE_ROLES),
        Tag("MODERATOR", "Mod", "Can manage messages or kick/ban people", MANAGE_MESSAGES or KICK_MEMBERS or BAN_MEMBERS),
        Tag("VOICE_MODERATOR", "VC Mod", "Can manage voice chats", MOVE_MEMBERS or MUTE_MEMBERS or DEAFEN_MEMBERS),
        Tag("CHAT_MODERATOR", "Chat Mod", "Can timeout people", MODERATE_MEMBERS),
    )

    override val settingsSchema: List<PluginSetting> = tagList.map {
        PluginSetting.Switch("show_${it.key}", it.displayName, it.description, default = true)
    } + listOf(
        PluginSetting.Switch("dontShowForBots", "Don't show extra tags for bots (excluding webhooks)"),
        PluginSetting.Switch("dontShowBotTag", "Show extra tags in place of the BOT tag"),
        PluginSetting.Switch("showWebhookTagFully", "Show Webhook tag in followed channels like announcements"),
    )

    // Permissions are computed from the role table, which is cheap but not free; rows rebind often while scrolling
    private class CachedPerms(val perms: Long, val at: Long)
    private val permCache = LinkedHashMap<String, CachedPerms>()

    private fun permissions(userId: Long, guildId: Long, message: Message, entry: MessageEntry): Long {
        val key = "$userId:$guildId:${message.channelId}"
        val now = SystemClock.elapsedRealtime()
        permCache[key]?.let { if (now - it.at < CACHE_TTL_MS) return it.perms }

        val guild = StoreStream.getGuilds().getGuild(guildId) ?: return 0L
        val member = entry.author ?: Members.member(guildId, userId) ?: return 0L
        val roles = entry.roles ?: Members.roles(guildId) ?: return 0L
        val perms = PermissionUtils.computeNonThreadPermissions(userId, guildId, guild.ownerId, member, roles, overwrites(message.channelId))

        if (permCache.size >= MAX_CACHE) permCache.remove(permCache.keys.first())
        permCache[key] = CachedPerms(perms, now)
        return perms
    }

    /** The overwrites of a channel, or of its parent for threads, which have none of their own. */
    private fun overwrites(channelId: Long): Collection<PermissionOverwrite> {
        var channel = Members.channel(channelId) ?: return emptyList()
        if (channel.type in THREAD_TYPES) channel = Members.channel(channel.parentId) ?: return emptyList()
        return channel.permissionOverwrites
    }

    /** Port of Endcord PC's getTag for messages. */
    private fun tagFor(entry: MessageEntry): Tag? {
        val message = entry.message
        val user = message.author ?: return null
        if (user.id == 1L) return null
        val bot = user.e() == true
        val webhook = isWebhook(message)
        if (bot && !webhook && bool("dontShowForBots")) return null

        val guildId = Members.guildId(message)
        val guild = if (guildId != 0L) StoreStream.getGuilds().getGuild(guildId) else null
        val isOwner = guild != null && guild.ownerId == user.id
        var perms = -1L

        for (tag in tagList) {
            if (!bool("show_${tag.key}")) continue
            // Owners match every permission tag, so hiding the owner tag hides the rest for them too
            if (tag.key != "OWNER" && isOwner && !bool("show_OWNER")) continue
            val matches = when (tag.key) {
                "WEBHOOK" -> webhook
                "OWNER" -> isOwner
                else -> {
                    if (guild == null || webhook) false else {
                        if (perms == -1L) perms = permissions(user.id, guildId, message, entry)
                        perms and tag.permissions != 0L
                    }
                }
            }
            if (matches) return tag
        }
        return null
    }

    private fun isWebhook(message: Message): Boolean {
        if (message.webhookId == null) return false
        // Messages from followed channels are posted by a webhook too, with a reference to the original
        val followed = message.type == 0 && message.messageReference != null && !bool("showWebhookTagFully")
        return !followed
    }

    private val decorator = object : ChatDecorator(name, priority = 50) {
        override fun afterConfigure(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry) {
            val view = Header.tag(holder) ?: return
            val tag = tagFor(entry) ?: return
            val discordTagShown = view.visibility == View.VISIBLE
            // Android shows a single tag: webhooks get theirs in place of BOT, other bots keep BOT unless asked
            if (discordTagShown && tag.key != "WEBHOOK" && !bool("dontShowBotTag")) return
            view.text = I18n.t(tag.displayName).uppercase(Locale.getDefault())
            view.setCompoundDrawablesWithIntrinsicBounds(0, 0, 0, 0)
            view.visibility = View.VISIBLE
        }
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        permCache.clear()
        super.stop(context)
    }

    private companion object {
        const val CACHE_TTL_MS = 10_000L
        const val MAX_CACHE = 500

        const val KICK_MEMBERS = 1L shl 1
        const val BAN_MEMBERS = 1L shl 2
        const val ADMINISTRATOR = 1L shl 3
        const val MANAGE_CHANNELS = 1L shl 4
        const val MANAGE_GUILD = 1L shl 5
        const val MANAGE_MESSAGES = 1L shl 13
        const val MUTE_MEMBERS = 1L shl 22
        const val DEAFEN_MEMBERS = 1L shl 23
        const val MOVE_MEMBERS = 1L shl 24
        const val MANAGE_ROLES = 1L shl 28
        const val MODERATE_MEMBERS = 1L shl 40

        /** Announcement, public and private thread channel types. */
        val THREAD_TYPES = setOf(10, 11, 12)
    }
}
