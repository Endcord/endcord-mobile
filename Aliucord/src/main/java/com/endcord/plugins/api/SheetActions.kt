/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.api

import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.annotation.DrawableRes
import androidx.core.content.ContextCompat
import com.aliucord.Logger
import com.aliucord.api.PatcherAPI
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.utils.ViewUtils.findViewById
import com.discord.api.channel.Channel
import com.discord.app.AppBottomSheet
import com.discord.utilities.color.ColorCompat
import com.discord.widgets.channels.list.WidgetChannelsListItemChannelActions
import com.discord.widgets.user.usersheet.WidgetUserSheet
import com.discord.widgets.user.usersheet.WidgetUserSheetViewModel
import com.lytefast.flexinput.R
import java.util.concurrent.CopyOnWriteArrayList
import com.discord.models.user.User as ModelUser

/**
 * Entries added to one of Discord's bottom sheets, the way [com.endcord.plugins.api.MessageActions] does
 * it for the message sheet. Owners must call [unregisterAll] when they stop.
 */
internal abstract class SheetEntries<C> {
    private class Entry<C>(
        val owner: String,
        val label: String,
        @DrawableRes val icon: Int,
        val visible: (C) -> Boolean,
        val onClick: (C) -> Unit,
    )

    protected val logger = Logger(javaClass.simpleName)
    private val entries = CopyOnWriteArrayList<Entry<C>>()
    private val viewId = View.generateViewId()
    private var patched = false

    fun register(owner: String, label: String, @DrawableRes icon: Int, visible: (C) -> Boolean = { true }, onClick: (C) -> Unit) {
        entries += Entry(owner, label, icon, visible, onClick)
        synchronized(this) {
            if (!patched) {
                patched = true
                patch(PatcherAPI(logger))
            }
        }
    }

    fun unregisterAll(owner: String) {
        entries.removeAll { it.owner == owner }
    }

    protected abstract fun patch(patcher: PatcherAPI)

    /** Replaces this helper's views in [layout] with the entries visible for [ctx], starting at [index]. */
    protected fun fill(layout: ViewGroup, index: Int, ctx: C, sheet: AppBottomSheet) {
        var removedBefore = 0
        for (i in layout.childCount - 1 downTo 0) {
            if (layout.getChildAt(i).id == viewId) {
                if (i < index) removedBefore++
                layout.removeViewAt(i)
            }
        }
        var insertAt = (index - removedBefore).coerceIn(0, layout.childCount)
        if (entries.isEmpty()) return

        for (entry in entries) {
            val shown = try {
                entry.visible(ctx)
            } catch (e: Throwable) {
                logger.error("${entry.owner}: visibility check failed", e)
                false
            }
            if (!shown) continue

            val context = layout.context
            val view = TextView(context, null, 0, R.i.UiKit_Settings_Item_Icon).apply {
                id = viewId
                text = I18n.t(entry.label)
                ContextCompat.getDrawable(context, entry.icon)?.mutate()?.let {
                    it.setTint(ColorCompat.getThemedColor(context, R.b.colorInteractiveNormal))
                    setCompoundDrawablesRelativeWithIntrinsicBounds(it, null, null, null)
                }
                setOnClickListener {
                    try {
                        entry.onClick(ctx)
                    } catch (e: Throwable) {
                        logger.errorToast("${entry.owner}: action failed", e)
                    }
                    try {
                        sheet.dismiss()
                    } catch (_: Throwable) {
                    }
                }
            }
            layout.addView(view, insertAt++)
        }
    }

    /** Index right after the direct child of [layout] that contains [view], or the end of [layout]. */
    protected fun indexAfter(layout: ViewGroup, view: View?): Int {
        var current: View? = view
        while (current != null) {
            val parent = current.parent
            if (parent === layout) return layout.indexOfChild(current) + 1
            current = parent as? View
        }
        return layout.childCount
    }
}

/** Entries in the sheet shown when long-pressing a channel or a direct message in the channel list. */
internal object ChannelSheetActions : SheetEntries<ChannelSheetActions.Context>() {
    class Context(
        @JvmField val channel: Channel,
        @JvmField val model: WidgetChannelsListItemChannelActions.Model,
        @JvmField val sheet: WidgetChannelsListItemChannelActions,
    )

    override fun patch(patcher: PatcherAPI) {
        patcher.after<WidgetChannelsListItemChannelActions>("configureUI", WidgetChannelsListItemChannelActions.Model::class.java) { param ->
            val model = param.args[0] as? WidgetChannelsListItemChannelActions.Model ?: return@after
            val channel = model.channel ?: return@after
            try {
                val root = requireView() as ViewGroup
                val divider = root.findViewById<View?>("developer_divider")
                val layout = (divider?.parent as? LinearLayout) ?: (root.getChildAt(0) as? LinearLayout) ?: return@after
                val index = if (divider != null && divider.parent === layout) layout.indexOfChild(divider) else layout.childCount
                fill(layout, index, Context(channel, model, this), this)
            } catch (e: Throwable) {
                logger.error("Failed to add channel actions", e)
            }
        }
    }
}

/** Entries at the bottom of the user profile sheet, after Discord's own "Copy ID". */
internal object UserSheetActions : SheetEntries<UserSheetActions.Context>() {
    class Context(
        @JvmField val user: ModelUser,
        @JvmField val state: WidgetUserSheetViewModel.ViewState.Loaded,
        @JvmField val sheet: WidgetUserSheet,
    )

    override fun patch(patcher: PatcherAPI) {
        patcher.after<WidgetUserSheet>("configureUI", WidgetUserSheetViewModel.ViewState::class.java) { param ->
            val state = param.args[0] as? WidgetUserSheetViewModel.ViewState.Loaded ?: return@after
            val user = state.user ?: return@after
            try {
                val root = requireView()
                val layout = root.findViewById<LinearLayout?>("user_sheet_content") ?: return@after
                val index = indexAfter(layout, layout.findViewById<View?>("user_sheet_copy_id"))
                fill(layout, index, Context(user, state, this), this)
            } catch (e: Throwable) {
                logger.error("Failed to add user actions", e)
            }
        }
    }
}
