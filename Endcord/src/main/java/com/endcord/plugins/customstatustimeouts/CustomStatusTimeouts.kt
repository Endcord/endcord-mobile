/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.customstatustimeouts

import android.content.Context
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import android.widget.RadioButton
import android.widget.RadioGroup
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.patcher.before
import com.discord.databinding.WidgetUserSetCustomStatusBinding
import com.discord.utilities.time.TimeUtils
import com.discord.widgets.user.WidgetUserSetCustomStatus
import com.discord.widgets.user.WidgetUserSetCustomStatusViewModel
import com.discord.widgets.user.WidgetUserSetCustomStatusViewModel.FormState.Expiration
import com.google.android.material.radiobutton.MaterialRadioButton
import java.lang.reflect.Method
import java.util.Calendar
import java.lang.ref.WeakReference
import java.util.WeakHashMap

/**
 * The app's "Clear after" list is a fixed radio group backed by an enum. Extra durations are extra radio buttons:
 * picking one stores its duration, and the expiry the screen computes when saving is replaced with it.
 */
internal class CustomStatusTimeouts : EndcordPlugin(
    name = "CustomStatusTimeouts",
    description = "Adds configurable timeout presets to the custom status screen.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("activity", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch("showForeverOnTop", "Show the Forever option at the top of the list instead of the bottom.", null, true),
        PluginSetting.Text("extraSeconds", "Extra seconds to add, separated by a comma (e.g. 5, 10, 30)", null, "15, 30, 45"),
        PluginSetting.Text("extraMinutes", "Extra minutes to add, separated by a comma (e.g. 5, 10, 30)", null, "5, 10, 30"),
        PluginSetting.Text("extraHours", "Extra hours to add, separated by a comma (e.g. 2, 4, 6, 12)", null, "2, 4, 6, 12"),
        PluginSetting.Text("extraDays", "Extra days to add, separated by a comma (e.g. 1, 2)", null, "1, 2"),
    )

    /** The extra radio buttons of one open custom status screen. */
    private class Screen(val builtIns: List<RadioButton>, val extras: List<RadioButton>, val durations: List<Long>) {
        var selected: Long? = null

        fun showSelection() {
            val sel = selected ?: run {
                extras.forEach { it.isChecked = false }
                return
            }
            builtIns.forEach { it.isChecked = false }
            extras.forEachIndexed { i, b -> b.isChecked = durations[i] == sel }
        }
    }

    /**
     * The extra radios of each open screen. The value is weak because the screen's views lead back to the view
     * model (the key) and would keep the entry, and the whole screen, alive forever; the radios hold it instead.
     */
    private val screens = WeakHashMap<WidgetUserSetCustomStatusViewModel, WeakReference<Screen>>()

    private fun screenOf(vm: Any?): Screen? = screens[vm]?.get()

    /** Set while the plugin itself calls setExpiration, so that call doesn't count as the user picking a built-in. */
    private var settingOwnExpiration = false

    private val getBinding: Method by lazy {
        WidgetUserSetCustomStatus::class.java.getDeclaredMethod("getBinding").apply { isAccessible = true }
    }
    private val getViewModel: Method by lazy {
        WidgetUserSetCustomStatus::class.java.getDeclaredMethod("getViewModel").apply { isAccessible = true }
    }

    override fun start(context: Context) {
        patcher.after<WidgetUserSetCustomStatus>("onViewBound", View::class.java) {
            try {
                addOptions(this)
            } catch (e: Throwable) {
                logger.error("Failed to add the extra timeouts", e)
            }
        }

        // The app re-checks the radio of the form's expiration on every update; keep the extra one checked instead
        patcher.after<WidgetUserSetCustomStatus>("updateView", WidgetUserSetCustomStatusViewModel.ViewState::class.java) {
            try {
                screenOf(getViewModel.invoke(this))?.showSelection()
            } catch (e: Throwable) {
                logger.error("Failed to show the selected timeout", e)
            }
        }

        // The user picked one of the app's own durations
        patcher.before<WidgetUserSetCustomStatusViewModel>("setExpiration", Expiration::class.java) {
            if (settingOwnExpiration) return@before
            screenOf(this)?.let {
                it.selected = null
                it.showSelection()
            }
        }

        // Saving: replace the expiry of the placeholder duration with the picked one
        patcher.before<WidgetUserSetCustomStatusViewModel>("getExpirationUTCDateString", Expiration::class.java) { param ->
            val selected = screenOf(this)?.selected ?: return@before
            param.result = TimeUtils.`toUTCDateTime$default`(System.currentTimeMillis() + selected, null, 2, null)
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        screens.clear()
    }

    private fun addOptions(fragment: WidgetUserSetCustomStatus) {
        val binding = getBinding.invoke(fragment) as WidgetUserSetCustomStatusBinding
        val vm = getViewModel.invoke(fragment) as WidgetUserSetCustomStatusViewModel
        val group = binding.d.parent as? RadioGroup ?: return
        val template = binding.d
        // g: never, e: 30 minutes, d: 1 hour, f: 4 hours, h: today
        val builtIns = listOf<RadioButton>(binding.g, binding.e, binding.d, binding.f, binding.h)
        val builtInDurations = listOf(FOREVER, 30 * MINUTE, HOUR, 4 * HOUR, untilMidnight())

        val durations = ArrayList<Long>()
        val labels = ArrayList<String>()
        fun add(values: List<Long>, unit: Long, one: String, many: String) {
            for (v in values) {
                val ms = v * unit
                if (ms <= 0 || ms in builtInDurations || ms in durations) continue
                durations.add(ms)
                labels.add(if (v == 1L) I18n.t(one) else I18n.t(many, "count" to v))
            }
        }
        add(numbers("extraSeconds"), SECOND, "For 1 second", "For {count} seconds")
        add(numbers("extraMinutes"), MINUTE, "For 1 minute", "For {count} minutes")
        add(numbers("extraHours"), HOUR, "For 1 hour", "For {count} hours")
        add(numbers("extraDays"), DAY, "For 1 day", "For {count} days")
        // Like Endcord PC: only the week and month lengths Discord was seen to accept
        add(listOf(1L, 2L, 3L), WEEK, "For 1 week", "For {count} weeks")
        add(listOf(2L, 4L), DAYS_30, "For 1 month", "For {count} months")

        val ctx = group.context
        val extras = labels.mapIndexed { i, label ->
            MaterialRadioButton(ctx).apply {
                text = label
                layoutParams = RadioGroup.LayoutParams(template.layoutParams as ViewGroup.MarginLayoutParams)
                setTextSize(TypedValue.COMPLEX_UNIT_PX, template.textSize)
                setTextColor(template.textColors)
                typeface = template.typeface
                setPadding(template.paddingLeft, template.paddingTop, template.paddingRight, template.paddingBottom)
                minHeight = template.minHeight
                buttonTintList = template.buttonTintList
                template.background?.constantState?.newDrawable()?.let { background = it }
                setOnClickListener { pick(vm, durations[i]) }
            }
        }
        val screen = Screen(builtIns, extras, durations)
        screens[vm] = WeakReference(screen)
        extras.forEach { it.tag = screen }

        // Sort everything by duration, Forever first or last. Only when the group holds nothing but the radios.
        val all = ArrayList<RadioButton>(builtIns).apply { addAll(extras) }
        val allDurations = ArrayList<Long>(builtInDurations).apply { addAll(durations) }
        var onlyRadios = true
        for (i in 0 until group.childCount) if (group.getChildAt(i) !in builtIns) onlyRadios = false
        if (onlyRadios) {
            val foreverFirst = bool("showForeverOnTop")
            fun key(idx: Int): Long {
                val d = allDurations[idx]
                return if (d == FOREVER) (if (foreverFirst) Long.MIN_VALUE else Long.MAX_VALUE) else d
            }
            val order = ArrayList<Int>()
            for (i in all.indices) order.add(i)
            order.sortWith(Comparator { a, b -> key(a).compareTo(key(b)) })
            group.removeAllViews()
            for (idx in order) group.addView(all[idx])
        } else {
            extras.forEach { group.addView(it) }
        }
    }

    private fun pick(vm: WidgetUserSetCustomStatusViewModel, duration: Long) {
        val screen = screenOf(vm) ?: return
        screen.selected = duration
        // Any duration other than Never makes the screen compute an expiry, which is then replaced
        settingOwnExpiration = true
        try {
            vm.setExpiration(Expiration.IN_30_MINUTES)
        } finally {
            settingOwnExpiration = false
        }
        screen.showSelection()
    }

    private fun numbers(key: String): List<Long> = list(key).mapNotNull { it.toLongOrNull() }.filter { it > 0 }

    private fun untilMidnight(): Long {
        val midnight = Calendar.getInstance().apply {
            add(Calendar.DAY_OF_YEAR, 1)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        return midnight.timeInMillis - System.currentTimeMillis()
    }

    private companion object {
        const val FOREVER = -1L
        const val SECOND = 1_000L
        const val MINUTE = 60 * SECOND
        const val HOUR = 60 * MINUTE
        const val DAY = 24 * HOUR
        const val WEEK = 7 * DAY
        const val DAYS_30 = 30 * DAY
    }
}
