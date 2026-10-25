/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.identitycommon

import com.aliucord.Logger
import com.discord.models.presence.Presence
import com.discord.stores.StoreStream
import com.discord.stores.StoreUserPresence
import java.lang.reflect.Field

/** Reads presences from the app's snapshot, which the UI thread may read at any time. */
internal object Presences {
    private val logger = Logger("Endcord/Presences")

    // StoreUserPresence has two getPresences() that differ only by return type, which Kotlin can't pick from
    private val fSnapshot: Field? by lazy {
        try {
            StoreUserPresence::class.java.getDeclaredField("presencesSnapshot").apply { isAccessible = true }
        } catch (e: Throwable) {
            logger.error("presencesSnapshot not found", e)
            null
        }
    }

    /** The presence of [userId], your own included, or null when the app doesn't know it. */
    @Suppress("UNCHECKED_CAST")
    fun get(userId: Long): Presence? {
        val store = StoreStream.getPresences()
        if (userId == Members.myId()) return store.localPresence
        val map = fSnapshot?.get(store) as Map<Long, Presence>? ?: return null
        return map[userId]
    }
}
