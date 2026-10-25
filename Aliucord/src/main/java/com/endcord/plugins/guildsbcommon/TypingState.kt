/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.guildsbcommon

import com.aliucord.Logger
import com.aliucord.utils.RxUtils.subscribe
import com.aliucord.utils.RxUtils.ui
import com.discord.models.domain.ModelUserRelationship
import com.discord.stores.StoreStream
import com.discord.stores.StoreUserTyping
import com.discord.stores.updates.ObservationDeck
import com.discord.stores.updates.ObservationDeckProvider
import com.endcord.plugins.userscommon.Users
import rx.Emitter
import rx.Subscription
import java.lang.reflect.Field
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Who is typing where, for every channel at once. One subscription to Discord's own typing store
 * ([StoreUserTyping], which already leaves out the current user and drops users 10 seconds after their last
 * typing event) feeds every typing plugin of this batch, so none of them patch the store or the gateway.
 *
 * Listeners are called on the main thread with the new state whenever it changes.
 */
internal object TypingState {
    fun interface Listener {
        fun onTypingChanged(typing: Map<Long, Set<Long>>)
    }

    private class Reg(val owner: String, val listener: Listener)

    private val logger = Logger("TypingState")
    private val listeners = CopyOnWriteArrayList<Reg>()
    private var subscription: Subscription? = null

    /** Channel ID -> IDs of the users typing in it. Only read on the main thread. */
    @Volatile
    var current: Map<Long, Set<Long>> = emptyMap()
        private set

    private val snapshotField: Field by lazy {
        StoreUserTyping::class.java.getDeclaredField("typingUsersSnapshot").apply { isAccessible = true }
    }

    @JvmStatic
    fun register(owner: String, listener: Listener) {
        listeners += Reg(owner, listener)
        ensureSubscribed()
        try {
            listener.onTypingChanged(current)
        } catch (e: Throwable) {
            logger.error("$owner: failed to handle typing", e)
        }
    }

    @JvmStatic
    fun unregisterAll(owner: String) {
        listeners.removeAll { it.owner == owner }
        if (listeners.isEmpty()) {
            synchronized(this) {
                subscription?.unsubscribe()
                subscription = null
            }
            current = emptyMap()
        }
    }

    @Synchronized
    private fun ensureSubscribed() {
        if (subscription != null) return
        val store = StoreStream.getUsersTyping()
        val observable = ObservationDeckProvider.get().connectRx(
            arrayOf<ObservationDeck.UpdateSource>(store), true, Emitter.BackpressureMode.n, "EndcordTypingState",
        ) { copy(store) }
        subscription = observable.ui().subscribe {
            current = this
            for (reg in listeners) {
                try {
                    reg.listener.onTypingChanged(this)
                } catch (e: Throwable) {
                    logger.error("${reg.owner}: failed to handle typing", e)
                }
            }
        }
    }

    // Runs on the store thread, right after the store took its snapshot
    private fun copy(store: StoreUserTyping): Map<Long, Set<Long>> {
        return try {
            @Suppress("UNCHECKED_CAST")
            val snapshot = snapshotField.get(store) as? Map<Long, Set<Long>> ?: return emptyMap()
            val out = HashMap<Long, Set<Long>>(snapshot.size)
            for ((channelId, users) in snapshot) if (users.isNotEmpty()) out[channelId] = HashSet(users)
            out
        } catch (e: Throwable) {
            logger.error("Failed to read typing users", e)
            emptyMap()
        }
    }

    /** The users typing in [channelId], optionally without the users you blocked, in a stable order. */
    @JvmStatic
    fun typingIn(channelId: Long, includeBlocked: Boolean = false, typing: Map<Long, Set<Long>> = current): List<Long> {
        val users = typing[channelId] ?: return emptyList()
        if (users.isEmpty()) return emptyList()
        val list = ArrayList<Long>(users)
        if (!includeBlocked) {
            val relationships = StoreStream.getUserRelationships().relationships
            list.removeAll { relationships[it] == ModelUserRelationship.TYPE_BLOCKED }
        }
        list.sort()
        return list
    }

    /** The name Discord shows for [userId] in [guildId]: their server nickname, display name or username. */
    @JvmStatic
    fun displayName(userId: Long, guildId: Long?): String {
        val user = StoreStream.getUsers().users[userId] ?: return userId.toString()
        if (guildId != null && guildId != 0L) {
            val member = StoreStream.getGuilds().getMember(guildId, userId)
            val nick = member?.nick
            if (!nick.isNullOrEmpty()) return nick
        }
        return Users.displayName(user)
    }
}
