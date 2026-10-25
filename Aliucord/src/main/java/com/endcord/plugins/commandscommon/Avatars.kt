/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.commandscommon

import com.aliucord.Http
import com.discord.stores.StoreStream
import org.json.JSONObject

/** Avatar URLs on Discord's CDN, for users that may or may not be cached locally. */
internal object Avatars {
    /** What an avatar URL is built from. */
    class AvatarOwner(val id: Long, val avatarHash: String?, val discriminator: Int)

    /**
     * Finds [userId] in the user cache, or asks the API for it. Blocks, so only call it off the main thread.
     * Returns null when the user doesn't exist or can't be fetched.
     */
    @JvmStatic
    fun findUser(userId: Long): AvatarOwner? {
        StoreStream.getUsers().users[userId]?.let { return AvatarOwner(it.id, it.avatar, it.discriminator) }
        return try {
            val json = JSONObject(Net.text(Http.Request.newDiscordRequest("/users/$userId")))
            AvatarOwner(
                json.getString("id").toLong(),
                json.optString("avatar").takeIf { it.isNotEmpty() && it != "null" },
                json.optString("discriminator", "0").toIntOrNull() ?: 0,
            )
        } catch (_: Throwable) {
            null
        }
    }

    /**
     * The URL of a user's global avatar at [size] pixels. Animated avatars are returned as GIF unless
     * [static] is set; users without an avatar get their default one.
     */
    @JvmStatic
    fun url(owner: AvatarOwner, size: Int, static: Boolean = false): String {
        val hash = owner.avatarHash
        if (hash.isNullOrEmpty()) {
            // Users on the new username system have discriminator 0 and pick their default avatar from their id
            val index = if (owner.discriminator == 0) ((owner.id ushr 22) % 6).toInt() else owner.discriminator % 5
            return "https://cdn.discordapp.com/embed/avatars/$index.png"
        }
        val ext = if (hash.startsWith("a_") && !static) "gif" else "png"
        return "https://cdn.discordapp.com/avatars/${owner.id}/$hash.$ext?size=$size"
    }

    /** The URL of a member's server avatar, or null when they don't have one in that server. */
    @JvmStatic
    fun serverAvatarUrl(guildId: Long, userId: Long, size: Int, static: Boolean = false): String? {
        val hash = StoreStream.getGuilds().getMember(guildId, userId)?.avatarHash
        if (hash.isNullOrEmpty()) return null
        val ext = if (hash.startsWith("a_") && !static) "gif" else "png"
        return "https://cdn.discordapp.com/guilds/$guildId/users/$userId/avatars/$hash.$ext?size=$size"
    }
}
