/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.identitycommon

import android.content.Context
import android.graphics.drawable.Drawable
import android.text.SpannableString
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.widget.TextView
import androidx.annotation.DrawableRes
import androidx.core.content.ContextCompat
import com.endcord.plugins.api.CenteredDrawableSpan

/**
 * Inline icons for message headers. Drawables are shared between rows: one per resource, size and tint, so
 * binding a row allocates only the small spannable that holds it.
 */
internal object Icons {
    private val cache = HashMap<String, Drawable>()

    /** [res] at [sizePx], tinted with [tint] (null keeps the drawable's own colors). */
    fun get(context: Context, @DrawableRes res: Int, sizePx: Int, tint: Int?): Drawable? {
        val key = "$res:$sizePx:${tint ?: "none"}"
        cache[key]?.let { return it }
        val drawable = ContextCompat.getDrawable(context, res)?.mutate() ?: return null
        if (tint != null) drawable.setTint(tint)
        drawable.setBounds(0, 0, sizePx, sizePx)
        if (cache.size > 256) cache.clear()
        cache[key] = drawable
        return drawable
    }

    /** The icon size that matches the text of [view]. */
    fun sizeFor(view: TextView, scale: Float = 1.15f): Int = (view.textSize * scale).toInt()

    /** A one character spannable showing [drawable], centred on the line. */
    fun span(drawable: Drawable, marginPx: Int): CharSequence = SpannableString(" ").apply {
        setSpan(CenteredDrawableSpan(drawable, marginPx), 0, 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }

    /** Appends [res] as an inline icon sized for [view]. Returns false when the drawable is missing. */
    fun append(builder: SpannableStringBuilder, view: TextView, @DrawableRes res: Int, tint: Int?, scale: Float = 1.15f): Boolean {
        val drawable = get(view.context, res, sizeFor(view, scale), tint) ?: return false
        builder.append(span(drawable, (view.textSize * 0.08f).toInt()))
        return true
    }

    fun clear() = cache.clear()
}
