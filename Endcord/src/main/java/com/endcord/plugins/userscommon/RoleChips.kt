/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.userscommon

import android.view.View
import com.aliucord.Logger
import com.aliucord.api.PatcherAPI
import com.aliucord.patcher.after
import com.discord.api.role.GuildRole
import com.discord.widgets.roles.RolesListView
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Tap and long-press handlers on the role chips of the user profile sheet ([RolesListView]), so several
 * plugins can react to roles without overwriting each other's listeners. Owners must call [unregisterAll]
 * when they stop.
 */
internal object RoleChips {
    /** A role chip that was tapped or long-pressed. */
    class Chip(@JvmField val view: View, @JvmField val role: GuildRole, @JvmField val guildId: Long)

    private class Handler(val owner: String, val onClick: ((Chip) -> Unit)?, val onLongClick: ((Chip) -> Unit)?)

    private val logger = Logger("RoleChips")
    private val handlers = CopyOnWriteArrayList<Handler>()
    private var patcher: PatcherAPI? = null

    @Synchronized
    fun register(owner: String, onClick: ((Chip) -> Unit)? = null, onLongClick: ((Chip) -> Unit)? = null) {
        handlers += Handler(owner, onClick, onLongClick)
        if (patcher == null) install()
    }

    @Synchronized
    fun unregisterAll(owner: String) {
        handlers.removeAll { it.owner == owner }
        if (handlers.isEmpty()) {
            patcher?.unpatchAll()
            patcher = null
        }
    }

    private fun install() {
        val p = PatcherAPI(logger)
        patcher = p
        p.after<RolesListView>(
            "updateView",
            List::class.java,
            Int::class.javaPrimitiveType!!,
            Long::class.javaPrimitiveType!!,
        ) { param ->
            try {
                @Suppress("UNCHECKED_CAST")
                val roles = (param.args[0] as List<GuildRole>?) ?: return@after
                val guildId = param.args[2] as Long
                val count = minOf(childCount, roles.size)
                for (i in 0 until count) bind(getChildAt(i), roles[i], guildId)
            } catch (e: Throwable) {
                logger.error("Failed to set up role chips", e)
            }
        }
    }

    private fun bind(view: View, role: GuildRole, guildId: Long) {
        val chip = Chip(view, role, guildId)
        if (handlers.any { it.onClick != null }) {
            view.setOnClickListener {
                val handler = handlers.firstOrNull { h -> h.onClick != null } ?: return@setOnClickListener
                try {
                    handler.onClick!!(chip)
                } catch (e: Throwable) {
                    logger.errorToast("${handler.owner}: role action failed", e)
                }
            }
        }
        if (handlers.any { it.onLongClick != null }) {
            view.setOnLongClickListener {
                val handler = handlers.firstOrNull { h -> h.onLongClick != null } ?: return@setOnLongClickListener false
                try {
                    handler.onLongClick!!(chip)
                } catch (e: Throwable) {
                    logger.errorToast("${handler.owner}: role action failed", e)
                }
                true
            }
        }
    }
}
