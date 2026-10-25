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
import com.discord.models.message.Message
import com.discord.utilities.color.ColorCompat
import com.discord.widgets.chat.list.actions.WidgetChatListActions
import com.lytefast.flexinput.R
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Lets built-in plugins add entries to the message long-press sheet without each of them patching it.
 * Entries are removed automatically when their plugin is stopped.
 */
object MessageActions {
    /** What an entry's callbacks get to work with. */
    class Context internal constructor(
        @JvmField val message: Message,
        @JvmField val model: WidgetChatListActions.Model,
        @JvmField val sheet: WidgetChatListActions,
    )

    private class Entry(
        val owner: String,
        val label: String,
        @DrawableRes val icon: Int,
        val visible: (Context) -> Boolean,
        val onClick: (Context) -> Unit,
    )

    private val logger = Logger("MessageActions")
    private val entries = CopyOnWriteArrayList<Entry>()
    private val viewId = View.generateViewId()
    private var patched = false

    /**
     * Adds an entry to the message long-press sheet.
     *
     * @param owner Name of the plugin adding the entry, used to remove it again in [unregisterAll].
     * @param label English label of the entry, translated when shown.
     * @param icon Drawable shown next to the label.
     * @param visible Whether to show the entry for a message. Keep this cheap.
     * @param onClick Called when the entry is tapped. The sheet is dismissed afterwards.
     */
    @JvmStatic
    @JvmOverloads
    fun register(
        owner: String,
        label: String,
        @DrawableRes icon: Int = R.e.ic_more_primary100_24dp,
        visible: (Context) -> Boolean = { true },
        onClick: (Context) -> Unit,
    ) {
        entries += Entry(owner, label, icon, visible, onClick)
        ensurePatched()
    }

    /** Removes every entry added by [owner]. */
    @JvmStatic
    fun unregisterAll(owner: String) {
        entries.removeAll { it.owner == owner }
    }

    @Synchronized
    private fun ensurePatched() {
        if (patched) return
        patched = true

        PatcherAPI(logger).after<WidgetChatListActions>("configureUI", WidgetChatListActions.Model::class.java) { param ->
            if (entries.isEmpty()) return@after
            val model = param.args[0] as WidgetChatListActions.Model
            val message = model.message ?: return@after

            try {
                val layout = (requireView() as ViewGroup).findViewById<LinearLayout>("dialog_chat_actions_container")
                // configureUI runs again whenever the model updates, so drop the entries of the previous run
                for (i in layout.childCount - 1 downTo 0) {
                    if (layout.getChildAt(i).id == viewId) layout.removeViewAt(i)
                }

                val ctx = Context(message, model, this)
                var insertAt = layout.indexOfChild(layout.findViewById<View?>("dialog_chat_actions_edit")).let {
                    if (it < 0) layout.childCount else it
                }
                for (entry in entries) {
                    val shown = try {
                        entry.visible(ctx)
                    } catch (e: Throwable) {
                        logger.error("${entry.owner}: visibility check failed", e)
                        false
                    }
                    if (!shown) continue

                    layout.addView(makeEntryView(layout, entry, ctx), insertAt++)
                }
            } catch (e: Throwable) {
                logger.error("Failed to add message actions", e)
            }
        }
    }

    private fun makeEntryView(parent: ViewGroup, entry: Entry, ctx: Context): View {
        val context = parent.context
        return TextView(context, null, 0, R.i.UiKit_Settings_Item_Icon).apply {
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
                ctx.sheet.dismiss()
            }
        }
    }
}
