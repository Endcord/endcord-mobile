/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.guildsbcommon

import android.widget.TextView
import com.aliucord.utils.DimenUtils
import java.util.WeakHashMap

/**
 * Typing dots shown at the end of a [TextView] (a channel name, for example), next to whatever text it shows.
 * The dots are a compound drawable, so they follow the text's colour and need no change to Discord's layouts.
 *
 * Remembers the views it decorated so they can be updated in place when typing changes, without rebinding lists.
 */
internal class TypingRows<T> {
    private val rows = WeakHashMap<TextView, T>()

    /** Remembers that [view] now shows [row]. Main thread only. */
    fun bind(view: TextView, row: T) {
        rows[view] = row
    }

    /** Forgets [view] and removes its dots. */
    fun unbind(view: TextView) {
        rows.remove(view)
        hide(view)
    }

    /** Calls [block] for every view that is still around. */
    fun forEach(block: (TextView, T) -> Unit) {
        for (entry in ArrayList(rows.entries)) {
            val view = entry.key ?: continue
            block(view, entry.value)
        }
    }

    /** Removes the dots from every view and forgets them all. */
    fun clear() {
        for (view in ArrayList(rows.keys)) if (view != null) hide(view)
        rows.clear()
    }

    companion object {
        /** Shows or hides the typing dots at the end of [view]. */
        @JvmStatic
        fun show(view: TextView, visible: Boolean) {
            if (!visible) {
                hide(view)
                return
            }
            val drawables = view.compoundDrawablesRelative
            val end = drawables[2]
            if (end is TypingDotsDrawable) {
                end.color = view.currentTextColor
                if (!end.isRunning) end.start()
                return
            }
            if (end != null) return // Discord's own drawable, leave it alone
            val dots = TypingDotsDrawable(view.currentTextColor)
            if (view.compoundDrawablePadding == 0) view.compoundDrawablePadding = DimenUtils.dpToPx(6)
            view.setCompoundDrawablesRelativeWithIntrinsicBounds(drawables[0], drawables[1], dots, drawables[3])
            dots.start()
        }

        @JvmStatic
        fun hide(view: TextView) {
            val drawables = view.compoundDrawablesRelative
            val end = drawables[2] as? TypingDotsDrawable ?: return
            end.stop()
            view.setCompoundDrawablesRelativeWithIntrinsicBounds(drawables[0], drawables[1], null, drawables[3])
        }
    }
}
