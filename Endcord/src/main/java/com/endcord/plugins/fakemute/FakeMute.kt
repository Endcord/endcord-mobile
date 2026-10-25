/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.fakemute

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.endcord.plugins.voicecommon.CallIndicator
import com.endcord.plugins.voicecommon.CallSettingsEntries
import com.endcord.plugins.voicecommon.FakeVoiceState

internal class FakeMute : EndcordPlugin(
    name = "FakeMute",
    description = "Appear muted to others in voice channels while keeping your microphone active. Toggle from the call settings sheet.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("voice", "fun")

    override val settingsSchema = listOf(
        PluginSetting.Action(
            "toggle",
            "Toggle fake mute",
            "Also available as a switch in the call settings sheet (gear of the full screen call)",
        ) { toggle(!FakeVoiceState.fakeMute) },
    )

    private fun toggle(value: Boolean) {
        FakeVoiceState.setFakeMute(value)
        CallIndicator.refresh()
        Utils.showToast(
            if (value) I18n.t("Fake mute on: others see you as muted, but your microphone is still live")
            else I18n.t("Fake mute off"),
            value,
        )
    }

    override fun start(context: Context) {
        CallSettingsEntries.registerSwitch(
            name,
            "Fake mute",
            "Others see you as muted, your microphone stays live",
            checked = { FakeVoiceState.fakeMute },
        ) { _, value -> toggle(value) }
        CallIndicator.register(name) { if (FakeVoiceState.fakeMute) I18n.t("Fake muted") else null }
    }

    override fun stop(context: Context) {
        super.stop(context)
        CallSettingsEntries.unregisterAll(name)
        CallIndicator.unregisterAll(name)
        // Never leave the user in a fake state once the plugin is off
        FakeVoiceState.setFakeMute(false)
    }
}
