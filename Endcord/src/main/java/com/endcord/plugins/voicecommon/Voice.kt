/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.voicecommon

import android.app.Activity
import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.i18n.I18n
import com.aliucord.utils.RxUtils.subscribe
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.aliucord.wrappers.ChannelWrapper.Companion.name
import com.aliucord.wrappers.ChannelWrapper.Companion.recipientIds
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.aliucord.wrappers.ChannelWrapper.Companion.userLimit
import com.aliucord.wrappers.users.globalName
import com.discord.api.channel.Channel
import com.discord.api.voice.state.VoiceState
import com.discord.stores.StoreStream
import com.discord.stores.StoreVoiceChannelSelected

/**
 * Lookups and actions on Discord's voice stores shared by the voice plugins. Reads use the stores' snapshots
 * and are safe from any thread, except the `live` variants which must run on the store thread (inside a
 * [VoiceEvents] listener).
 *
 * The legacy app's [VoiceState] getters are obfuscated: `a()` channel id, `b()` server deafened, `c()` guild id,
 * `e()` server muted, `g()` self deafened, `h()` self muted, `i()` streaming, `j()` camera, `k()` session id,
 * `l()` suppressed, `m()` user id.
 */
internal object Voice {
    val logger = Logger("VoiceCommon")

    const val TYPE_DM = 1
    const val TYPE_VOICE = 2
    const val TYPE_GROUP_DM = 3
    const val TYPE_STAGE = 13

    const val PERM_VIEW_CHANNEL = 1L shl 10
    const val PERM_CONNECT = 1L shl 20
    const val PERM_MUTE_MEMBERS = 1L shl 22
    const val PERM_DEAFEN_MEMBERS = 1L shl 23
    const val PERM_MOVE_MEMBERS = 1L shl 24

    private const val RELATIONSHIP_FRIEND = 1
    private const val RELATIONSHIP_BLOCKED = 2

    fun myId(): Long = try {
        StoreStream.getUsers().me.id
    } catch (e: Throwable) {
        0L
    }

    /** The voice channel this client is connected to, or 0. */
    fun myChannelId(): Long = try {
        StoreStream.getVoiceChannelSelected().selectedVoiceChannelId
    } catch (e: Throwable) {
        0L
    }

    fun channel(id: Long): Channel? = if (id == 0L) null else StoreStream.getChannels().getChannel(id)

    fun channelName(id: Long): String = channel(id)?.name?.takeIf { it.isNotEmpty() } ?: I18n.t("channel")

    fun isPrivate(channel: Channel): Boolean = channel.guildId == 0L

    /** Voice states of everyone in [channelId], from the last published snapshot. */
    fun statesIn(channelId: Long): List<VoiceState> = collect(StoreStream.getVoiceStates().get(), channelId)

    /** Same as [statesIn] but from the store's live map. Store thread only. */
    fun liveStatesIn(channelId: Long): List<VoiceState> =
        collect(StoreStream.getVoiceStates().`getInternal$app_productionGoogleRelease`(), channelId)

    private fun collect(all: Map<Long, Map<Long, VoiceState>>?, channelId: Long): List<VoiceState> {
        if (all == null || channelId == 0L) return emptyList()
        val guildId = channel(channelId)?.guildId
        val result = ArrayList<VoiceState>()
        val scan = if (guildId != null) listOfNotNull(all[guildId]) else all.values
        for (users in scan) {
            for (state in users.values) if (state.a() == channelId) result += state
        }
        return result
    }

    /** The channel [userId] is connected to anywhere this client can see, or null. */
    fun channelOf(userId: Long): Long? {
        val all = StoreStream.getVoiceStates().get() ?: return null
        for (users in all.values) users[userId]?.a()?.let { return it }
        return null
    }

    /** Whether the current user has every bit of [permission] in [channel]. DMs allow everything voice related. */
    fun can(channel: Channel, permission: Long): Boolean {
        if (isPrivate(channel)) return true
        val perms = StoreStream.getPermissions().permissionsByChannel[channel.id] ?: return false
        return perms and permission == permission
    }

    fun isFriend(userId: Long): Boolean = StoreStream.getUserRelationships().relationships[userId] == RELATIONSHIP_FRIEND

    fun isBlocked(userId: Long): Boolean = StoreStream.getUserRelationships().relationships[userId] == RELATIONSHIP_BLOCKED

    fun username(userId: Long): String = StoreStream.getUsers().users[userId]?.username ?: userId.toString()

    /** Server nickname, then display name, then username. */
    fun displayName(userId: Long, guildId: Long): String {
        if (guildId != 0L) {
            StoreStream.getGuilds().getMember(guildId, userId)?.nick?.takeIf { it.isNotEmpty() }?.let { return it }
        }
        val user = StoreStream.getUsers().users[userId] ?: return userId.toString()
        return try {
            user.globalName?.takeIf { it.isNotEmpty() }
        } catch (e: Throwable) {
            null
        } ?: user.username
    }

    /** The one to one DM with [userId], if the app has it. */
    fun dmChannelId(userId: Long): Long? {
        val privates = StoreStream.getChannels().getChannelsForGuild(0L) ?: return null
        for (channel in privates.values) {
            if (channel.type == TYPE_DM && channel.recipientIds.contains(userId)) return channel.id
        }
        return null
    }

    /** The app's activity for dialogs, or null while the app isn't in front. */
    fun activity(): Activity? = try {
        Utils.appActivity.takeIf { !it.isFinishing && !it.isDestroyed }
    } catch (e: Throwable) {
        null
    }

    /** Whether [channel] is a voice channel with a user limit that is currently reached. */
    fun isFull(channel: Channel, live: Boolean = false): Boolean {
        val limit = try {
            channel.userLimit
        } catch (e: Throwable) {
            0
        }
        if (limit <= 0 || channel.type != TYPE_VOICE) return false
        val count = if (live) liveStatesIn(channel.id).size else statesIn(channel.id).size
        return count >= limit
    }

    /**
     * Joins [channelId] the way the app does when the user taps a channel: Discord's own checks for
     * permissions and full channels apply. [onResult] runs on the main thread.
     */
    fun join(channelId: Long, onResult: ((StoreVoiceChannelSelected.JoinVoiceChannelResult) -> Unit)? = null) {
        try {
            val result = StoreStream.getVoiceChannelSelected().selectVoiceChannel(channelId)
            if (onResult != null) {
                result.subscribe {
                    val value = this
                    Utils.mainThread.post {
                        try {
                            onResult(value)
                        } catch (e: Throwable) {
                            logger.error("Join callback failed", e)
                        }
                    }
                }
            }
        } catch (e: Throwable) {
            logger.error("Failed to join voice channel $channelId", e)
        }
    }

    /** Leaves the current voice channel, like the disconnect button. */
    fun leave() {
        try {
            StoreStream.getVoiceChannelSelected().clear()
        } catch (e: Throwable) {
            logger.error("Failed to leave the voice channel", e)
        }
    }

    /** Short toast text for a failed join, or null when the join worked. */
    fun joinFailure(result: StoreVoiceChannelSelected.JoinVoiceChannelResult): String? = when (result) {
        StoreVoiceChannelSelected.JoinVoiceChannelResult.FAILED_CHANNEL_FULL -> I18n.t("Channel is full")
        StoreVoiceChannelSelected.JoinVoiceChannelResult.FAILED_PERMISSIONS_MISSING ->
            I18n.t("Insufficient permissions to enter in the voice channel")
        StoreVoiceChannelSelected.JoinVoiceChannelResult.FAILED_CHANNEL_DOES_NOT_EXIST -> I18n.t("Channel not found")
        StoreVoiceChannelSelected.JoinVoiceChannelResult.FAILED_GUILD_VIDEO_AT_CAPACITY -> I18n.t("Channel is full")
        else -> null
    }
}
