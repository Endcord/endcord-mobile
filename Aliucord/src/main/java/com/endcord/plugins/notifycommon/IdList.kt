/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.notifycommon

import com.aliucord.api.SettingsAPI

/**
 * A list of Discord ids kept in a text setting, comma or newline separated, the way the PC plugins store them.
 * Parsing is cached until the text changes, so hot paths can call [contains] for every message.
 */
internal class IdList(private val settings: SettingsAPI, private val key: String) {
    @Volatile
    private var cachedText: String? = null

    @Volatile
    private var cached: Set<Long> = emptySet()

    fun ids(): Set<Long> {
        val text = settings.getString(key, "") ?: ""
        if (text != cachedText) {
            cached = parse(text)
            cachedText = text
        }
        return cached
    }

    operator fun contains(id: Long): Boolean = id != 0L && id in ids()

    fun isEmpty(): Boolean = ids().isEmpty()

    /** Adds or removes [id], returns whether it is in the list afterwards. */
    fun toggle(id: Long): Boolean {
        val current = LinkedHashSet(ids())
        val added = if (id in current) {
            current.remove(id)
            false
        } else {
            current.add(id)
            true
        }
        settings.setString(key, current.joinToString(", "))
        return added
    }

    companion object {
        fun parse(text: String): Set<Long> {
            if (text.isBlank()) return emptySet()
            val out = LinkedHashSet<Long>()
            for (part in text.split(',', '\n', ' ', ';')) {
                val id = part.trim().toLongOrNull() ?: continue
                if (id > 0L) out.add(id)
            }
            return out
        }
    }
}
