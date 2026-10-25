/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.fakedeafen

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.endcord.plugins.voicecommon.CallIndicator
import com.endcord.plugins.voicecommon.CallSettingsEntries
import com.endcord.plugins.voicecommon.FakeVoiceState

internal class FakeDeafen : EndcordPlugin(
    name = "FakeDeafen",
    description = "Makes others see you as deafened while you can still hear everything. Sends a real voice state update so the icon shows for everyone.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("voice", "fun")

    override val settingsSchema = listOf(
        PluginSetting.Action(
            "toggle",
            "Toggle fake deafen",
            "Also available as a switch in the call settings sheet (gear of the full screen call)",
        ) { toggle(!FakeVoiceState.fakeDeaf) },
    )

    private fun toggle(value: Boolean) {
        FakeVoiceState.setFakeDeaf(value)
        CallIndicator.refresh()
        Utils.showToast(
            if (value) I18n.t("Fake deafen on: others see you as deafened, but you still hear everything and your microphone is live")
            else I18n.t("Fake deafen off"),
            value,
        )
    }

    override fun start(context: Context) {
        CallSettingsEntries.registerSwitch(
            name,
            "Fake deafen",
            "Others see you as deafened, you still hear everyone",
            checked = { FakeVoiceState.fakeDeaf },
        ) { _, value -> toggle(value) }
        CallIndicator.register(name) { if (FakeVoiceState.fakeDeaf) I18n.t("Fake deafened") else null }
    }

    override fun stop(context: Context) {
        super.stop(context)
        CallSettingsEntries.unregisterAll(name)
        CallIndicator.unregisterAll(name)
        // Never leave the user in a fake state once the plugin is off
        FakeVoiceState.setFakeDeaf(false)
    }
}
