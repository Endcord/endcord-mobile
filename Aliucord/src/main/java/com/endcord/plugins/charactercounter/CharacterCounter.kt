/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.charactercounter

import android.annotation.SuppressLint
import android.content.Context
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.after
import com.aliucord.patcher.before
import com.aliucord.utils.DimenUtils
import com.discord.utilities.color.ColorCompat
import com.endcord.plugins.composercommon.ChatInputs
import com.endcord.plugins.composercommon.ComposerUtils
import com.lytefast.flexinput.R
import com.lytefast.flexinput.fragment.FlexInputFragment
import java.util.WeakHashMap

/** Shows `count/limit` above the chat input while you type. */
internal class CharacterCounter : EndcordPlugin(
    name = "CharacterCounter",
    description = "Adds a character counter to the chat input",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            "colorEffects",
            "Enable yellow/red colouring as you get closer to the character limit",
            default = true,
        ),
    )

    private class Counter(val view: TextView, val watcher: TextWatcher)

    /** The counter of every open chat input; removed in onDestroyView, the counter's views lead back to the key. */
    private val counters = WeakHashMap<FlexInputFragment, Counter>()
    @Volatile private var running = false

    override fun start(context: Context) {
        running = true
        patcher.after<FlexInputFragment>("onViewCreated", View::class.java, Bundle::class.java) {
            // Posted so the input is attached to its container by then
            val fragment = this
            view?.post {
                try {
                    if (running && fragment.view != null) attach(fragment)
                } catch (e: Throwable) {
                    logger.error("Failed to add the character counter", e)
                }
            }
        }
        patcher.before<FlexInputFragment>("onDestroyView") {
            try {
                detach(this)
            } catch (e: Throwable) {
                logger.error("Failed to remove the character counter", e)
            }
        }
        // Chat inputs that are already open
        for (fragment in ChatInputs.current()) {
            try {
                attach(fragment)
            } catch (e: Throwable) {
                logger.error("Failed to add the character counter", e)
            }
        }
    }

    override fun stop(context: Context) {
        running = false
        for (fragment in counters.keys.toList()) detach(fragment)
        counters.clear()
        super.stop(context)
    }

    private fun detach(fragment: FlexInputFragment) {
        val counter = counters.remove(fragment) ?: return
        (counter.view.parent as? ViewGroup)?.removeView(counter.view)
        try {
            fragment.l().removeTextChangedListener(counter.watcher)
        } catch (e: Throwable) {
            // the view is already gone
        }
    }

    private fun attach(fragment: FlexInputFragment) {
        detach(fragment)
        val root = fragment.view ?: return
        val input = fragment.l()

        // The chat input fragment sits in a vertical list (reply bar, autocomplete, input); add a row above it
        val holder = root.parent as? View
        val column = holder?.parent as? LinearLayout
        val counterView = createView(root.context)
        if (holder != null && column != null && column.orientation == LinearLayout.VERTICAL) {
            column.addView(counterView, column.indexOfChild(holder))
        } else if (root is LinearLayout && root.orientation == LinearLayout.VERTICAL) {
            root.addView(counterView, 0)
        } else {
            logger.warn("No place for the character counter in ${holder?.parent?.javaClass?.name}")
            return
        }

        val watcher = object : TextWatcher {
            override fun afterTextChanged(s: Editable?) = update(counterView, s?.length ?: 0)
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        }
        input.addTextChangedListener(watcher)
        counters[fragment] = Counter(counterView, watcher)
        update(counterView, input.text?.length ?: 0)
    }

    private fun createView(context: Context) = TextView(context).apply {
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
        gravity = Gravity.END
        val padding = DimenUtils.dpToPx(12)
        setPadding(padding, DimenUtils.dpToPx(2), padding, 0)
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        visibility = View.GONE
    }

    @SuppressLint("SetTextI18n")
    private fun update(view: TextView, length: Int) {
        try {
            if (length == 0) {
                view.visibility = View.GONE
                return
            }
            val max = ComposerUtils.messageLimit()
            view.visibility = View.VISIBLE
            view.text = "$length/$max"
            view.setTextColor(color(view.context, length * 100 / max))
        } catch (e: Throwable) {
            logger.error("Failed to update the character counter", e)
        }
    }

    private fun color(context: Context, percentage: Int): Int {
        val muted = ColorCompat.getThemedColor(context, R.b.colorTextMuted)
        if (!bool("colorEffects")) return muted
        return when {
            percentage < 50 -> muted
            percentage < 75 -> YELLOW
            percentage < 90 -> ORANGE
            else -> RED
        }
    }

    private companion object {
        const val YELLOW = 0xFFF0B232.toInt()
        const val ORANGE = 0xFFE67E22.toInt()
        const val RED = 0xFFF23F43.toInt()
    }
}
