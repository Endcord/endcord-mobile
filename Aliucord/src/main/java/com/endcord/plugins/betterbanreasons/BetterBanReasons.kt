/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.betterbanreasons

import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.view.ViewGroup
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.after
import com.discord.utilities.color.ColorCompat
import com.discord.utilities.dimen.DimenUtils
import com.discord.widgets.user.WidgetBanUser
import com.lytefast.flexinput.R

/**
 * The Android ban dialog already has a free text reason field (what PC's "show a text input by default" option
 * gives), so this adds a row of your custom reasons under it; tapping one fills the field. PC's per-reason
 * message deletion duration is left out, the dialog's own deletion choice still applies.
 */
internal class BetterBanReasons : EndcordPlugin(
    name = "BetterBanReasons",
    description = "Adds your own ban reasons to the ban dialog. Tap one to fill in the reason.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("moderation", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            key = "reasons",
            label = "Your custom reasons",
            description = "One reason per line",
            multiline = true,
        ),
    )

    private val rowId = View.generateViewId()

    override fun start(context: Context) {
        patcher.after<WidgetBanUser>("onViewBound", View::class.java) {
            try {
                addReasons(this)
            } catch (e: Throwable) {
                logger.error("Failed to add the ban reasons", e)
            }
        }
    }

    private fun addReasons(dialog: WidgetBanUser) {
        val reasons = string("reasons").split('\n').map { it.trim() }.filter { it.isNotEmpty() }
        if (reasons.isEmpty()) return
        val input = WidgetBanUser.`access$getBinding$p`(dialog).h
        val parent = input.parent as? ViewGroup ?: return
        parent.findViewById<View?>(rowId)?.let { parent.removeView(it) }

        val ctx = input.context
        val gap = DimenUtils.dpToPixels(8)
        val chips = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
        for (reason in reasons) {
            chips.addView(
                TextView(ctx, null, 0, R.i.UiKit_TextView).apply {
                    text = reason
                    maxLines = 1
                    setPadding(gap + gap / 2, gap / 2 + 2, gap + gap / 2, gap / 2 + 2)
                    background = GradientDrawable().apply {
                        cornerRadius = DimenUtils.dpToPixels(16).toFloat()
                        setColor(ColorCompat.getThemedColor(ctx, R.b.colorBackgroundSecondaryAlt))
                    }
                    setOnClickListener {
                        input.editText?.run {
                            setText(reason)
                            setSelection(reason.length)
                        }
                    }
                },
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                    marginEnd = gap
                },
            )
        }
        val row = HorizontalScrollView(ctx).apply {
            id = rowId
            isHorizontalScrollBarEnabled = false
            addView(chips)
        }
        val params = ViewGroup.MarginLayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        (input.layoutParams as? ViewGroup.MarginLayoutParams)?.let {
            params.leftMargin = it.leftMargin
            params.rightMargin = it.rightMargin
        }
        params.topMargin = gap
        parent.addView(row, parent.indexOfChild(input) + 1, if (parent is LinearLayout) LinearLayout.LayoutParams(params) else params)
    }
}
