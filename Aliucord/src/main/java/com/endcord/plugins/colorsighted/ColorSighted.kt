/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.colorsighted

import android.content.Context
import android.graphics.drawable.Drawable
import androidx.core.content.ContextCompat
import com.aliucord.entities.EndcordPlugin
import com.aliucord.patcher.after
import com.discord.api.presence.ClientStatus
import com.discord.models.presence.Presence
import com.discord.utilities.presence.PresenceUtils
import com.discord.views.StatusView
import com.lytefast.flexinput.R

/**
 * Draws every status as a plain dot in its colour. [StatusView.setPresence] picks one of Discord's shaped icons
 * (moon, minus sign, hollow ring, play arrow); this swaps it for the round "online" dot tinted the same colour.
 * The phone icon of mobile users is left alone, as on desktop.
 */
internal class ColorSighted : EndcordPlugin(
    name = "ColorSighted",
    description = "Removes the colorblind-friendly icons from statuses, just like 2015-2017 Discord",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "accessibility")

    /** Tinted dots by colour, so binding a member list row doesn't inflate a vector drawable each time. */
    private val dots = HashMap<Int, Drawable.ConstantState>()

    override fun start(context: Context) {
        patcher.after<StatusView>("setPresence", Presence::class.java) { param ->
            try {
                val color = colorFor(this, param.args[0] as Presence?) ?: return@after
                dot(this.context, color)?.let { setImageDrawable(it) }
            } catch (e: Throwable) {
                logger.error("Failed to recolour a status", e)
            }
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        dots.clear()
    }

    /** The colour to draw [presence] in, or null when Discord's own icon (online dot, phone) should stay. */
    private fun colorFor(view: StatusView, presence: Presence?): Int? {
        // Same order of checks as StatusView.setPresence
        val statuses = presence?.clientStatuses
        if (view.l && statuses != null && PresenceUtils.INSTANCE.isMobile(statuses)) return null
        if (presence != null && PresenceUtils.INSTANCE.getStreamingActivity(presence) != null) return STREAMING_PURPLE
        val res = when (presence?.status) {
            ClientStatus.ONLINE -> return null
            ClientStatus.IDLE -> R.c.status_yellow
            ClientStatus.DND -> R.c.status_red
            else -> R.c.status_grey
        }
        return ContextCompat.getColor(view.context, res)
    }

    private fun dot(context: Context, color: Int): Drawable? {
        dots[color]?.let { return it.newDrawable(context.resources).mutate() }
        val drawable = ContextCompat.getDrawable(context, R.e.ic_status_online_16dp)?.mutate() ?: return null
        drawable.setTint(color)
        drawable.constantState?.let { dots[color] = it }
        return drawable
    }

    private companion object {
        /** Discord's streaming purple, which has no colour resource in this app version. */
        const val STREAMING_PURPLE = 0xFF593695.toInt()
    }
}
