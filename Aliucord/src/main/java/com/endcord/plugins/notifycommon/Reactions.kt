/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.notifycommon

import com.aliucord.Http
import com.aliucord.Logger
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import java.util.regex.Pattern

/**
 * Adds reactions one after another on a background thread, spaced out so automatic reactions stay below
 * Discord's reaction rate limit.
 */
internal object Reactions {
    private val logger = Logger("Reactions")
    private val queue by lazy { Executors.newSingleThreadExecutor() }
    private val customEmoji = Pattern.compile("^<a?:(\\w+):(\\d{15,21})>$")

    /** Turns `<:name:id>`, `<a:name:id>`, `name:id` or a unicode emoji into the form the API expects. */
    fun emojiKey(emoji: String): String {
        val trimmed = emoji.trim()
        val matcher = customEmoji.matcher(trimmed)
        return if (matcher.matches()) "${matcher.group(1)}:${matcher.group(2)}" else trimmed
    }

    /** owner -> generation; [cancel] bumps it so the owner's queued reactions are skipped. */
    private val generations = ConcurrentHashMap<String, Int>()
    private val pendingCounts = ConcurrentHashMap<String, AtomicInteger>()

    /** How many reactions of [owner] are waiting in the queue. */
    fun pending(owner: String): Int = pendingCounts[owner]?.get() ?: 0

    /** Drops every reaction of [owner] that hasn't been sent yet, for when a plugin is turned off. */
    fun cancel(owner: String) {
        synchronized(generations) { generations[owner] = (generations[owner] ?: 0) + 1 }
    }

    fun add(channelId: Long, messageId: Long, emoji: String, owner: String? = null, onDone: ((Boolean) -> Unit)? = null) {
        val generation = owner?.let { generations[it] ?: 0 }
        val counter = owner?.let { pendingCounts.getOrPut(it) { AtomicInteger() } }
        counter?.incrementAndGet()
        queue.execute {
            counter?.decrementAndGet()
            if (owner != null && (generations[owner] ?: 0) != generation) return@execute
            val ok = try {
                val encoded = URLEncoder.encode(emojiKey(emoji), "UTF-8").replace("+", "%20")
                Http.Request.newDiscordRNRequest("/channels/$channelId/messages/$messageId/reactions/$encoded/@me", "PUT")
                    .executeWithBody("")
                    .use { it.ok() }
            } catch (e: Throwable) {
                logger.error("Failed to react to $messageId", e)
                false
            }
            try {
                onDone?.invoke(ok)
                Thread.sleep(350L)
            } catch (_: Throwable) {
            }
        }
    }
}
