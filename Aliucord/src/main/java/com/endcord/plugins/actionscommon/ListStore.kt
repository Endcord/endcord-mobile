/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.actionscommon

import com.aliucord.Logger
import com.aliucord.api.SettingsAPI
import java.util.concurrent.CopyOnWriteArrayList

/**
 * A bounded list of records kept in a plugin's [SettingsAPI] as JSON.
 *
 * The in-memory list is the source of truth once [load] ran; every change is written back on
 * [Common.io] so the main thread never waits for the disk. When more than [limit] records are stored the
 * oldest ones (the end of the list) are dropped, so the settings file can't grow without bound.
 *
 * @param arrayType `Array<T>::class.java`, used by Gson to read the records back.
 */
internal class ListStore<T : Any>(
    private val settings: SettingsAPI,
    private val key: String,
    private val arrayType: Class<Array<T>>,
    private val limit: Int,
) {
    private val logger = Logger("ListStore")
    private val items = ArrayList<T>()
    private val listeners = CopyOnWriteArrayList<() -> Unit>()
    @Volatile
    private var loaded = false

    /** Reads the stored records. Cheap to call again, it only loads once. */
    @Synchronized
    fun load() {
        if (loaded) return
        loaded = true
        items.clear()
        try {
            // Gson leaves null slots for entries it couldn't read, whatever the declared type says
            @Suppress("UNCHECKED_CAST")
            val stored = settings.getObject<Array<T>?>(key, null, arrayType) as Array<T?>?
            if (stored != null) for (item in stored) if (item != null) items.add(item)
        } catch (e: Throwable) {
            logger.error("Failed to read $key, starting empty", e)
        }
    }

    /** Forgets the in-memory copy, for plugin stop. The stored data stays. */
    @Synchronized
    fun unload() {
        loaded = false
        items.clear()
        listeners.clear()
    }

    /** A snapshot of the records, newest first. */
    @Synchronized
    fun all(): List<T> = ArrayList(items)

    @Synchronized
    fun find(predicate: (T) -> Boolean): T? = items.firstOrNull(predicate)

    @Synchronized
    fun any(predicate: (T) -> Boolean): Boolean = items.any(predicate)

    val size: Int
        @Synchronized get() = items.size

    /** Puts [item] in front, dropping the oldest records past the limit. */
    fun add(item: T) = mutate {
        items.add(0, item)
        while (items.size > limit) items.removeAt(items.size - 1)
    }

    /** Removes every record matching [predicate]. */
    fun removeIf(predicate: (T) -> Boolean) = mutate { items.removeAll(predicate) }

    /** Replaces the first record matching [predicate] with [item], or adds it in front. */
    fun upsert(item: T, predicate: (T) -> Boolean) = mutate {
        val index = items.indexOfFirst(predicate)
        if (index >= 0) items.removeAt(index)
        items.add(0, item)
        while (items.size > limit) items.removeAt(items.size - 1)
    }

    /** Removes everything. */
    fun clear() = mutate { items.clear() }

    /** Called on the thread that made a change, after it was made. */
    fun addListener(listener: () -> Unit) {
        listeners += listener
    }

    fun removeListener(listener: () -> Unit) {
        listeners -= listener
    }

    private fun mutate(block: () -> Unit) {
        val snapshot: List<T>
        synchronized(this) {
            block()
            snapshot = ArrayList(items)
        }
        persist(snapshot)
        for (listener in listeners) {
            try {
                listener()
            } catch (e: Throwable) {
                logger.error("Listener failed", e)
            }
        }
    }

    private fun persist(snapshot: List<T>) {
        Common.io.execute {
            try {
                @Suppress("UNCHECKED_CAST")
                val array = java.lang.reflect.Array.newInstance(arrayType.componentType!!, snapshot.size) as Array<T>
                for (i in snapshot.indices) array[i] = snapshot[i]
                settings.setObject(key, array)
            } catch (e: Throwable) {
                logger.error("Failed to save $key", e)
            }
        }
    }
}
