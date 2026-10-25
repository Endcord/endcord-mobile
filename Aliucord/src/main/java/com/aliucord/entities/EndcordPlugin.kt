/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.aliucord.entities

import android.content.Context
import com.aliucord.i18n.I18n
import com.aliucord.settings.EndcordPluginSettingsPage
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.api.SendHooks

/**
 * Base class of the plugins that ship built into Endcord, ported from Endcord PC.
 *
 * Unlike the other coreplugins these are off until the user turns them on, they show up in the plugins page
 * with their own toggle, and they describe their settings declaratively through [settingsSchema] so every
 * plugin gets a consistent, translated settings page for free.
 *
 * Implementations should keep [start] cheap and undo everything they did in [stop]; the default [stop]
 * removes every patch and command the plugin registered.
 */
internal abstract class EndcordPlugin(
    name: String,
    description: String,
    /** Names of the people who wrote this plugin. */
    authors: Array<String> = arrayOf("Endcord"),
) : CorePlugin(Manifest(name, description)) {
    init {
        manifest.authors = authors.map { author ->
            val id = KNOWN_AUTHORS[author] ?: 0L
            Manifest.Author(author, id, id != 0L)
        }.toTypedArray<Manifest.Author?>()
    }

    /** Whether this plugin is on for users who never touched its toggle. */
    open val enabledByDefault: Boolean = false

    /** Whether toggling this plugin only takes effect after restarting the app. */
    open val restartRequired: Boolean = false

    /** Short lowercase keywords the plugins page can filter by, such as `chat` or `voice`. */
    open val tags: List<String> = emptyList()

    /** The description shown to the user, in their language. */
    val localizedDescription: String
        get() = I18n.pluginDescription(name, manifest.description)

    /**
     * The settings this plugin exposes. When not empty a settings page is generated automatically,
     * read the values back with [bool], [string], [int] and friends.
     */
    open val settingsSchema: List<PluginSetting> = emptyList()

    override fun requiresRestart(): Boolean = restartRequired

    override fun load(context: Context) {
        if (settingsSchema.isNotEmpty() && settingsTab == null) {
            settingsTab = SettingsTab(EndcordPluginSettingsPage::class.java).withArgs(name)
        }
    }

    override fun stop(context: Context) {
        patcher.unpatchAll()
        commands.unregisterAll()
        MessageActions.unregisterAll(name)
        ChatHooks.unregisterAll(name)
        SendHooks.unregisterAll(name)
    }

    private fun schemaEntry(key: String): PluginSetting? = settingsSchema.firstOrNull { it.key == key }

    /** Reads a boolean setting, defaulting to its [PluginSetting.Switch.default]. */
    protected fun bool(key: String): Boolean =
        settings.getBool(key, (schemaEntry(key) as? PluginSetting.Switch)?.default ?: false)

    /** Reads a text setting, defaulting to its [PluginSetting.Text.default]. */
    protected fun string(key: String): String =
        settings.getString(key, (schemaEntry(key) as? PluginSetting.Text)?.default ?: "") ?: ""

    /** Reads a number setting, defaulting to its [PluginSetting.Number.default]. */
    protected fun int(key: String): Int =
        settings.getInt(key, (schemaEntry(key) as? PluginSetting.Number)?.default ?: 0)

    /** Reads the value of a choice setting, defaulting to its [PluginSetting.Choice.default]. */
    protected fun choice(key: String): String {
        val entry = schemaEntry(key) as? PluginSetting.Choice
        return settings.getString(key, entry?.default ?: "") ?: ""
    }

    /** Splits a text setting into its non-blank comma or newline separated entries. */
    protected fun list(key: String): List<String> =
        string(key).split(',', '\n').map { it.trim() }.filter { it.isNotEmpty() }

    internal companion object {
        /** Discord IDs of Endcord's developers, so their names link to their profiles. */
        private val KNOWN_AUTHORS = mapOf(
            "ewlle" to 1097880625513496586L,
            "rootpoi" to 1390609041897554050L,
            "kraethis" to 904384828143706164L,
            "vpg" to 1374807824479162369L,
        )
    }
}

/** A single entry of an [EndcordPlugin.settingsSchema]. Labels and descriptions are English and get translated. */
sealed class PluginSetting(
    @JvmField val key: String,
    @JvmField val label: String,
    @JvmField val description: String?,
) {
    /** An on/off switch. */
    class Switch(key: String, label: String, description: String? = null, @JvmField val default: Boolean = false) :
        PluginSetting(key, label, description)

    /** Free text input. Use [multiline] for lists such as keywords. */
    class Text(
        key: String,
        label: String,
        description: String? = null,
        @JvmField val default: String = "",
        @JvmField val placeholder: String? = null,
        @JvmField val multiline: Boolean = false,
    ) : PluginSetting(key, label, description)

    /** A whole number, clamped to [min]..[max]. */
    class Number(
        key: String,
        label: String,
        description: String? = null,
        @JvmField val default: Int = 0,
        @JvmField val min: Int = Int.MIN_VALUE,
        @JvmField val max: Int = Int.MAX_VALUE,
    ) : PluginSetting(key, label, description)

    /** Pick one of [options]; option values are stored, option labels are shown (and translated). */
    class Choice(
        key: String,
        label: String,
        description: String? = null,
        @JvmField val options: List<Option>,
        @JvmField val default: String = options.first().value,
    ) : PluginSetting(key, label, description) {
        class Option(@JvmField val value: String, @JvmField val label: String)
    }

    /** A button that runs [onClick], for actions like clearing a cache. */
    class Action(key: String, label: String, description: String? = null, @JvmField val onClick: (Context) -> Unit) :
        PluginSetting(key, label, description)
}
