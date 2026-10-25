/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.aliucord.settings

import com.aliucord.Logger
import com.aliucord.i18n.I18n
import com.discord.stores.StoreStream

/** Keeps Discord's own display language in line with the language picked for Endcord, like Endcord PC does. */
internal object LanguageSync {
    private val logger = Logger("LanguageSync")

    /** The Discord locale that matches each Endcord language. */
    private fun discordLocaleOf(language: I18n.Language) = when (language) {
        I18n.Language.ENGLISH -> "en-US"
        I18n.Language.TURKISH -> "tr"
        I18n.Language.RUSSIAN -> "ru"
        I18n.Language.SPANISH -> "es-ES"
        I18n.Language.FRENCH -> "fr"
    }

    /** Switches Discord to [language], syncing the choice to the account like Discord's own language picker. */
    fun applyDiscordLocale(language: I18n.Language) {
        try {
            val target = discordLocaleOf(language)
            val store = StoreStream.getUserSettingsSystem()
            if (store.locale == target) return
            store.setLocale(target, true) {}
        } catch (e: Throwable) {
            logger.error("Failed to change Discord's language", e)
        }
    }

    /** Discord's current display language, if it is one Endcord supports. */
    fun currentDiscordLanguage(): I18n.Language? = try {
        StoreStream.getUserSettingsSystem().locale?.let { I18n.Language.fromCode(it) }
    } catch (_: Throwable) {
        null
    }
}
