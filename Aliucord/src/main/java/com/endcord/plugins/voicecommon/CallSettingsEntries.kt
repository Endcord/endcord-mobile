/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.voicecommon

import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.api.PatcherAPI
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.utils.ViewUtils.findViewById
import com.discord.api.channel.Channel
import com.discord.views.CheckedSetting
import com.discord.widgets.voice.sheet.WidgetVoiceSettingsBottomSheet
import com.lytefast.flexinput.R
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Switches and buttons added to the call settings sheet (the gear of the full screen call, Discord's
 * `WidgetVoiceSettingsBottomSheet`), right after Discord's own switches. Owners must call [unregisterAll] when
 * they stop. Callbacks run on the main thread.
 */
internal object CallSettingsEntries {
    private class Entry(
        val owner: String,
        val label: String,
        val subtext: String?,
        val visible: (Channel) -> Boolean,
        /** Null for a button. */
        val checked: ((Channel) -> Boolean)?,
        val onClick: (Channel, Boolean, WidgetVoiceSettingsBottomSheet) -> Unit,
    )

    private val logger = Logger("CallSettingsEntries")
    private val entries = CopyOnWriteArrayList<Entry>()
    private val viewId = View.generateViewId()
    private var patched = false

    /** A switch. [onToggle] gets the new value. */
    fun registerSwitch(
        owner: String,
        label: String,
        subtext: String? = null,
        visible: (Channel) -> Boolean = { true },
        checked: (Channel) -> Boolean,
        onToggle: (Channel, Boolean) -> Unit,
    ) {
        entries += Entry(owner, label, subtext, visible, checked) { channel, value, _ -> onToggle(channel, value) }
        ensurePatched()
    }

    /** A plain entry. The sheet stays open, [onClick] can dismiss it. */
    fun registerButton(
        owner: String,
        label: String,
        visible: (Channel) -> Boolean = { true },
        onClick: (Channel, WidgetVoiceSettingsBottomSheet) -> Unit,
    ) {
        entries += Entry(owner, label, null, visible, null) { channel, _, sheet -> onClick(channel, sheet) }
        ensurePatched()
    }

    fun unregisterAll(owner: String) {
        entries.removeAll { it.owner == owner }
    }

    @Synchronized
    private fun ensurePatched() {
        if (patched) return
        patched = true
        PatcherAPI(logger).after<WidgetVoiceSettingsBottomSheet>(
            "configureUI",
            WidgetVoiceSettingsBottomSheet.ViewState::class.java,
        ) { param ->
            try {
                val state = param.args[0] as? WidgetVoiceSettingsBottomSheet.ViewState ?: return@after
                val channel = state.channel ?: return@after
                val root = view as? ViewGroup ?: return@after
                val layout = root.getChildAt(0) as? LinearLayout ?: return@after
                fill(layout, channel, this)
            } catch (e: Throwable) {
                logger.error("Failed to add call settings entries", e)
            }
        }
    }

    private fun fill(layout: LinearLayout, channel: Channel, sheet: WidgetVoiceSettingsBottomSheet) {
        for (i in layout.childCount - 1 downTo 0) {
            if (layout.getChildAt(i).id == viewId) layout.removeViewAt(i)
        }
        if (entries.isEmpty()) return
        val anchor = layout.findViewById<View?>("voice_settings_noise_suppression")
        var index = if (anchor != null && anchor.parent === layout) layout.indexOfChild(anchor) + 1 else layout.childCount
        val context = layout.context

        for (entry in entries) {
            val shown = try {
                entry.visible(channel)
            } catch (e: Throwable) {
                logger.error("${entry.owner}: visibility check failed", e)
                false
            }
            if (!shown) continue

            val view: View = if (entry.checked != null) {
                Utils.createCheckedSetting(
                    context,
                    CheckedSetting.ViewType.SWITCH,
                    I18n.t(entry.label),
                    entry.subtext?.let { I18n.t(it) },
                ).apply {
                    isChecked = try {
                        entry.checked.invoke(channel)
                    } catch (e: Throwable) {
                        false
                    }
                    setOnCheckedListener { value ->
                        try {
                            entry.onClick(channel, value == true, sheet)
                        } catch (e: Throwable) {
                            logger.errorToast("${entry.owner}: action failed", e)
                        }
                    }
                }
            } else {
                TextView(context, null, 0, R.i.UiKit_Settings_Item).apply {
                    text = I18n.t(entry.label)
                    setOnClickListener {
                        try {
                            entry.onClick(channel, false, sheet)
                        } catch (e: Throwable) {
                            logger.errorToast("${entry.owner}: action failed", e)
                        }
                    }
                }
            }
            view.id = viewId
            layout.addView(view, index++)
        }
    }
}
