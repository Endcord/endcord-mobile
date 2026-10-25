/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.experiments

import android.content.Context
import android.view.View
import com.aliucord.entities.EndcordPlugin
import com.aliucord.patcher.after
import com.discord.databinding.WidgetSettingsBinding
import com.discord.widgets.settings.SettingsViewModel
import com.discord.widgets.settings.WidgetSettings
import java.lang.reflect.Method

internal class Experiments : EndcordPlugin(
    name = "Experiments",
    description = "Shows Discord's staff-only Developer options in settings, where experiments can be overridden",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("developers", "utility")

    private val getBinding: Method by lazy {
        WidgetSettings::class.java.getDeclaredMethod("getBinding").apply { isAccessible = true }
    }

    override fun start(context: Context) {
        // configureLoaded only shows the Developer options section (with the experiment overrides) to staff.
        // Its click listener is set for everyone, so showing the views is enough.
        patcher.after<WidgetSettings>("configureLoaded", SettingsViewModel.ViewState.Loaded::class.java) {
            try {
                val binding = getBinding.invoke(this) as WidgetSettingsBinding
                binding.n.visibility = View.VISIBLE // divider
                binding.o.visibility = View.VISIBLE // header
                binding.m.visibility = View.VISIBLE // Developer options
            } catch (e: Throwable) {
                logger.error("Failed to show the developer options", e)
            }
        }
    }
}
