/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.volumebooster

import android.content.Context
import android.widget.SeekBar
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.after
import com.aliucord.patcher.before
import com.discord.databinding.UserProfileVoiceSettingsViewBinding
import com.discord.stores.StoreMediaSettings
import com.discord.stores.StoreStream
import com.discord.widgets.user.usersheet.UserProfileVoiceSettingsView
import java.lang.reflect.Field
import kotlin.math.log10
import kotlin.math.roundToInt

internal class VolumeBooster : EndcordPlugin(
    name = "VolumeBooster",
    description = "Allows you to set the user volume above the default maximum",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("voice", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            "multiplier",
            "Volume Multiplier",
            "How far the volume slider in profiles goes, compared to Discord's 200%",
            options = listOf(
                PluginSetting.Choice.Option("1.5", "1.5× (300%)"),
                PluginSetting.Choice.Option("2", "2× (400%)"),
                PluginSetting.Choice.Option("2.5", "2.5× (500%)"),
            ),
            default = "2",
        ),
    )

    /** Highest volume the slider allows, as Discord's amplitude (100 = normal, Discord's own max is 200). */
    private fun maxAmplitude(): Float {
        val multiplier = choice("multiplier").toFloatOrNull() ?: 2f
        return (DEFAULT_MAX_AMPLITUDE * multiplier).coerceIn(DEFAULT_MAX_AMPLITUDE, SAFE_MAX_AMPLITUDE)
    }

    /**
     * Inverse of Discord's PerceptualVolumeUtils: slider positions 100..200 are 0..+6 dB, and this keeps that
     * slope above 200 so the boosted part of the slider feels like the rest.
     */
    private fun perceptual(amplitude: Float): Int {
        val db = 20.0 * log10(amplitude / 100.0)
        return (100.0 * (db / 6.0 + 1.0)).toInt()
    }

    private val bindingField: Field by lazy {
        UserProfileVoiceSettingsView::class.java.getDeclaredField("binding").apply { isAccessible = true }
    }

    override fun start(context: Context) {
        // The user sheet's volume slider: raise its max and restore the position Discord clamped
        patcher.after<UserProfileVoiceSettingsView>("updateView", UserProfileVoiceSettingsView.ViewState::class.java) { param ->
            try {
                val state = param.args[0] as UserProfileVoiceSettingsView.ViewState
                val binding = bindingField[this] as UserProfileVoiceSettingsViewBinding
                val seekBar: SeekBar = binding.e.j.d
                val max = perceptual(maxAmplitude())
                if (seekBar.max != max) seekBar.max = max
                state.outputVolume?.let { seekBar.progress = it.roundToInt().coerceIn(0, max) }
            } catch (e: Throwable) {
                logger.error("Failed to extend the volume slider", e)
            }
        }

        // Never let anything set a user's volume above the safe maximum
        patcher.before<StoreMediaSettings>("setUserOutputVolume", Long::class.javaPrimitiveType!!, Float::class.javaPrimitiveType!!) { param ->
            val volume = param.args[1] as Float
            val max = maxAmplitude()
            if (volume > max) param.args[1] = max
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        // Without the plugin the slider stops at 200%: bring boosted users back so they can be turned down again
        try {
            val media = StoreStream.getMediaSettings()
            val volumes = media.voiceConfigurationBlocking.userOutputVolumes
            for ((userId, volume) in volumes) {
                if (volume > DEFAULT_MAX_AMPLITUDE) media.setUserOutputVolume(userId, DEFAULT_MAX_AMPLITUDE)
            }
        } catch (e: Throwable) {
            logger.error("Failed to reset boosted volumes", e)
        }
    }

    private companion object {
        const val DEFAULT_MAX_AMPLITUDE = 200f

        /** 500%, about +14 dB. Louder than this mostly adds distortion and risks hurting ears. */
        const val SAFE_MAX_AMPLITUDE = 500f
    }
}
