/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.identitycommon

import android.graphics.Color
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.aliucord.wrappers.GuildRoleWrapper.Companion.position
import com.discord.api.channel.Channel
import com.discord.api.role.GuildRole
import com.discord.models.member.GuildMember
import com.discord.models.message.Message
import com.discord.stores.StoreStream
import com.discord.widgets.chat.list.entries.MessageEntry

/** Cheap lookups in Discord's stores for the message being bound. Everything here reads in-memory snapshots. */
internal object Members {
    /** Discord's type for one to one DMs. */
    const val TYPE_DM = 1

    /** Discord's type for group DMs. */
    const val TYPE_GROUP_DM = 3

    fun myId(): Long = try {
        StoreStream.getUsers().me.id
    } catch (e: Throwable) {
        0L
    }

    fun channel(id: Long): Channel? = StoreStream.getChannels().getChannel(id)

    /** The server a message was sent in, or 0 for DMs. */
    fun guildId(entry: MessageEntry): Long = guildId(entry.message)

    /** The server a message was sent in, or 0 for DMs. */
    fun guildId(message: Message): Long {
        message.guildId?.let { if (it != 0L) return it }
        return channel(message.channelId)?.guildId ?: 0L
    }

    /** Whether [channelId] is a one to one DM. */
    fun isDm(channelId: Long): Boolean = channel(channelId)?.type == TYPE_DM

    /** Whether [channelId] is a DM or a group DM. */
    fun isPrivate(channelId: Long): Boolean = (channel(channelId)?.guildId ?: 0L) == 0L

    fun member(guildId: Long, userId: Long): GuildMember? =
        if (guildId == 0L) null else StoreStream.getGuilds().getMember(guildId, userId)

    fun roles(guildId: Long): Map<Long, GuildRole>? = StoreStream.getGuilds().roles[guildId]

    /** Whether [color] is an actual color and not Discord's "no color" value. */
    fun hasColor(color: Int): Boolean = color != 0 && color != Color.BLACK

    /** The member's role color, or null when they have none. */
    fun roleColor(member: GuildMember?): Int? = member?.color?.takeIf { hasColor(it) }

    /**
     * The member's roles sorted from highest to lowest, skipping @everyone and any id in [excluded].
     * [roles] is the server's role table, such as [MessageEntry.getRoles].
     */
    fun sortedRoles(member: GuildMember, roles: Map<Long, GuildRole>?, excluded: Collection<Long> = emptyList()): List<GuildRole> {
        if (roles == null) return emptyList()
        val ids = member.roles ?: return emptyList()
        val list = ArrayList<GuildRole>(ids.size)
        for (id in ids) {
            if (id == member.guildId || id in excluded) continue
            roles[id]?.let { list += it }
        }
        list.sortWith(Comparator { a, b -> b.position.compareTo(a.position) })
        return list
    }
}
