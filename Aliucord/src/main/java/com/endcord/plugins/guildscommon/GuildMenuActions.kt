/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.guildscommon

import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.annotation.DrawableRes
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.aliucord.Logger
import com.aliucord.api.PatcherAPI
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.utils.ViewUtils.findViewById
import com.discord.models.guild.Guild
import com.discord.widgets.guilds.contextmenu.GuildContextMenuViewModel
import com.discord.widgets.guilds.contextmenu.WidgetGuildContextMenu
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Entries in the menu shown when long-pressing a server in the server list, shared by the plugins of this batch.
 * Entries go right above Discord's "Leave Server" and are removed when their plugin stops.
 */
internal object GuildMenuActions {
    class Context internal constructor(
        @JvmField val guild: Guild,
        @JvmField val activity: FragmentActivity,
    )

    private class Entry(
        val owner: String,
        val label: (Guild) -> String,
        @DrawableRes val icon: Int,
        val visible: (Guild) -> Boolean,
        val onClick: (Context) -> Unit,
    )

    private val logger = Logger("GuildMenuActions")
    private val entries = CopyOnWriteArrayList<Entry>()
    private val viewId = View.generateViewId()
    private var patched = false

    /**
     * Adds an entry to the server long-press menu.
     *
     * @param label English label for a server, translated when shown.
     */
    @JvmStatic
    fun register(
        owner: String,
        label: (Guild) -> String,
        @DrawableRes icon: Int,
        visible: (Guild) -> Boolean = { true },
        onClick: (Context) -> Unit,
    ) {
        entries += Entry(owner, label, icon, visible, onClick)
        ensurePatched()
    }

    @JvmStatic
    fun unregisterAll(owner: String) {
        entries.removeAll { it.owner == owner }
    }

    @Synchronized
    private fun ensurePatched() {
        if (patched) return
        patched = true

        PatcherAPI(logger).after<WidgetGuildContextMenu>(
            "configureValidUI", GuildContextMenuViewModel.ViewState.Valid::class.java,
        ) { param ->
            val state = param.args[0] as GuildContextMenuViewModel.ViewState.Valid
            try {
                val root = view as? ViewGroup ?: return@after
                val sample = root.findViewById<TextView?>("guild_context_menu_mark_as_read") ?: return@after
                val layout = sample.parent as? LinearLayout ?: return@after
                for (i in layout.childCount - 1 downTo 0) {
                    if (layout.getChildAt(i).id == viewId) layout.removeViewAt(i)
                }
                if (entries.isEmpty()) return@after

                val activity = activity ?: return@after
                val leave = root.findViewById<View?>("guild_context_menu_leave_guild")
                var insertAt = layout.indexOfChild(leave).let { if (it < 0) layout.childCount else it }
                for (entry in entries) {
                    val shown = try {
                        entry.visible(state.guild)
                    } catch (e: Throwable) {
                        logger.error("${entry.owner}: visibility check failed", e)
                        false
                    }
                    if (!shown) continue
                    layout.addView(makeView(sample, entry, Context(state.guild, activity)), insertAt++)
                }
            } catch (e: Throwable) {
                logger.error("Failed to add server menu entries", e)
            }
        }
    }

    private fun makeView(sample: TextView, entry: Entry, ctx: Context): TextView {
        val context = sample.context
        return TextView(context).apply {
            id = viewId
            layoutParams = LinearLayout.LayoutParams(sample.layoutParams as? ViewGroup.MarginLayoutParams ?: ViewGroup.MarginLayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ))
            setPadding(sample.paddingLeft, sample.paddingTop, sample.paddingRight, sample.paddingBottom)
            setTextSize(TypedValue.COMPLEX_UNIT_PX, sample.textSize)
            setTextColor(sample.textColors)
            typeface = sample.typeface
            gravity = sample.gravity
            minHeight = sample.minHeight
            background = sample.background?.constantState?.newDrawable()?.mutate()
            compoundDrawablePadding = sample.compoundDrawablePadding
            isClickable = true
            isFocusable = true
            text = I18n.t(entry.label(ctx.guild))

            val start = sample.compoundDrawablesRelative[0]
            if (start != null) {
                ContextCompat.getDrawable(context, entry.icon)?.mutate()?.let { icon ->
                    icon.setTintList(sample.compoundDrawableTintList ?: sample.textColors)
                    icon.setBounds(0, 0, start.bounds.width().takeIf { it > 0 } ?: icon.intrinsicWidth,
                        start.bounds.height().takeIf { it > 0 } ?: icon.intrinsicHeight)
                    setCompoundDrawablesRelative(icon, null, null, null)
                }
            }

            setOnClickListener {
                try {
                    WidgetGuildContextMenu.Companion!!.hide(ctx.activity, false)
                } catch (_: Throwable) {
                }
                try {
                    entry.onClick(ctx)
                } catch (e: Throwable) {
                    logger.errorToast("${entry.owner}: action failed", e)
                }
            }
        }
    }
}
