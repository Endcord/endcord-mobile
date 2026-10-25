/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.aliucord.settings

import android.annotation.SuppressLint
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.View
import android.widget.TextView
import com.aliucord.PluginManager
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.fragments.SelectDialog
import com.aliucord.fragments.SettingsPage
import com.aliucord.i18n.I18n
import com.aliucord.utils.DimenUtils
import com.aliucord.views.Button
import com.aliucord.views.TextInput
import com.discord.views.CheckedSetting
import com.lytefast.flexinput.R

/**
 * Settings page generated from an [EndcordPlugin.settingsSchema].
 * Every value is written as soon as it changes, so there is no save button to forget.
 */
@SuppressLint("SetTextI18n")
class EndcordPluginSettingsPage(private val pluginName: String) : SettingsPage() {
    /** Text edits waiting to be written, so typing doesn't rewrite the settings file on every keystroke. */
    private val pendingWrites = LinkedHashMap<String, Runnable>()

    private fun changed(plugin: EndcordPlugin, key: String) {
        try {
            plugin.onSettingChanged(key)
        } catch (e: Throwable) {
            plugin.logger.error("Failed to apply setting $key", e)
        }
    }

    /** Writes [write] once the user stopped typing for a moment. */
    private fun debounce(plugin: EndcordPlugin, key: String, write: () -> Unit) {
        pendingWrites.remove(key)?.let { Utils.mainThread.removeCallbacks(it) }
        val task = Runnable {
            pendingWrites.remove(key)
            write()
            changed(plugin, key)
        }
        pendingWrites[key] = task
        Utils.mainThread.postDelayed(task, 400)
    }

    override fun onPause() {
        // Flush edits that are still waiting when the page is left
        for (task in pendingWrites.values.toList()) {
            Utils.mainThread.removeCallbacks(task)
            task.run()
        }
        pendingWrites.clear()
        super.onPause()
    }

    override fun onViewBound(view: View) {
        super.onViewBound(view)

        val plugin = PluginManager.plugins[pluginName] as? EndcordPlugin
        setActionBarTitle(pluginName)
        setActionBarSubtitle(I18n.t("Plugin Settings"))
        if (plugin == null) return

        val ctx = view.context
        val settings = plugin.settings

        TextView(ctx, null, 0, R.i.UiKit_Settings_Item_Addition).run {
            text = plugin.localizedDescription
            setPadding(0, 0, 0, DimenUtils.defaultPadding)
            addView(this)
        }

        for (entry in plugin.settingsSchema) {
            val label = I18n.t(entry.label)
            val description: String? = entry.description?.let { I18n.t(it) }

            when (entry) {
                is PluginSetting.Switch -> {
                    Utils.createCheckedSetting(ctx, CheckedSetting.ViewType.SWITCH, label, description).run {
                        isChecked = settings.getBool(entry.key, entry.default)
                        setOnCheckedListener {
                            settings.setBool(entry.key, it)
                            changed(plugin, entry.key)
                        }
                        addView(this)
                    }
                }

                is PluginSetting.Text -> {
                    addLabel(label, description)
                    val input = TextInput(ctx, entry.placeholder?.let { I18n.t(it) } ?: label, settings.getString(entry.key, entry.default))
                    input.editText.run {
                        if (entry.multiline) {
                            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
                            maxLines = 8
                        } else {
                            maxLines = 1
                        }
                        addTextChangedListener(afterChange { text ->
                            debounce(plugin, entry.key) { settings.setString(entry.key, text) }
                        })
                    }
                    addView(input)
                }

                is PluginSetting.Number -> {
                    addLabel(label, description)
                    val input = TextInput(ctx, label, settings.getInt(entry.key, entry.default).toString())
                    input.editText.run {
                        inputType = InputType.TYPE_CLASS_NUMBER or
                            if (entry.min < 0) InputType.TYPE_NUMBER_FLAG_SIGNED else 0
                        maxLines = 1
                        addTextChangedListener(afterChange { text ->
                            val value = text.toIntOrNull() ?: return@afterChange
                            debounce(plugin, entry.key) { settings.setInt(entry.key, value.coerceIn(entry.min, entry.max)) }
                        })
                    }
                    addView(input)
                }

                is PluginSetting.Choice -> {
                    val current: () -> String = { settings.getString(entry.key, entry.default) ?: entry.default }
                    val currentLabel: () -> String = { I18n.t(entry.options.firstOrNull { it.value == current() }?.label ?: entry.default) }
                    TextView(ctx, null, 0, R.i.UiKit_Settings_Item_SubText).run {
                        text = "$label\n${currentLabel()}"
                        setOnClickListener {
                            SelectDialog().apply {
                                title = label
                                items = entry.options.map { I18n.t(it.label) }.toTypedArray()
                                onResultListener = { index ->
                                    settings.setString(entry.key, entry.options[index].value)
                                    this@run.text = "$label\n${currentLabel()}"
                                    changed(plugin, entry.key)
                                }
                            }.show(parentFragmentManager, entry.key)
                        }
                        addView(this)
                    }
                    if (description != null) addLabel(null, description)
                }

                is PluginSetting.Action -> {
                    if (description != null) addLabel(null, description)
                    Button(ctx).run {
                        text = label
                        setOnClickListener {
                            try {
                                entry.onClick(it.context)
                            } catch (e: Throwable) {
                                plugin.logger.errorToast(I18n.t("Something went wrong"), e)
                            }
                        }
                        addView(this)
                    }
                }
            }
        }

        if (plugin.requiresRestart()) {
            addDivider(ctx)
            addLabel(null, I18n.t("Changes to this plugin take effect after a restart."))
        }
    }

    private fun addLabel(label: String?, description: String?) {
        val ctx = context ?: return
        if (label != null) TextView(ctx, null, 0, R.i.UiKit_Settings_Item_Header).run {
            text = label
            isAllCaps = false
            addView(this)
        }
        if (description != null) TextView(ctx, null, 0, R.i.UiKit_Settings_Item_Addition).run {
            text = description
            addView(this)
        }
    }

    private inline fun afterChange(crossinline block: (String) -> Unit) = object : TextWatcher {
        override fun afterTextChanged(s: Editable?) = block(s?.toString() ?: "")
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
    }
}
