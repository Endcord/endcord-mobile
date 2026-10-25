/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.aliucord.i18n

import com.aliucord.Logger
import com.aliucord.Main
import com.aliucord.settings.LanguageSync
import java.util.Locale

/**
 * Endcord's localization system.
 *
 * Strings are keyed by their English text, the same way Endcord PC does it, so any string that has no
 * translation falls back to readable English instead of a raw key. Tables live in the JSON files under `Aliucord/i18n`
 * and are compiled into the core at build time (see `generateI18n` in the module's build script).
 */
object I18n {
    /** A language Endcord can be displayed in. */
    enum class Language(
        @JvmField val code: String,
        @JvmField val nativeName: String,
        @JvmField val englishName: String,
    ) {
        ENGLISH("en", "English", "English"),
        TURKISH("tr", "Türkçe", "Turkish"),
        RUSSIAN("ru", "Русский", "Russian"),
        SPANISH("es", "Español", "Spanish"),
        FRENCH("fr", "Français", "French");

        companion object {
            /** Maps any locale tag ("tr-TR", "es_419", ...) onto a supported language, defaulting to English. */
            @JvmStatic
            fun fromCode(code: String?): Language {
                val lower = code?.lowercase(Locale.ROOT)?.trim() ?: return ENGLISH
                return values().firstOrNull { it != ENGLISH && lower.startsWith(it.code) } ?: ENGLISH
            }
        }
    }

    /** Settings key holding the selected language code. */
    const val LANGUAGE_KEY = "EC_language"

    private val logger = Logger("I18n")
    private val tables = HashMap<String, Map<String, String>>(4)

    @Volatile
    private var cachedLanguage: Language? = null

    /** The language Endcord is currently displayed in. */
    @JvmStatic
    var language: Language
        get() = cachedLanguage ?: resolveLanguage().also { cachedLanguage = it }
        set(value) {
            cachedLanguage = value
            Main.settings?.setString(LANGUAGE_KEY, value.code)
        }

    private fun resolveLanguage(): Language {
        val stored = try {
            Main.settings?.getString(LANGUAGE_KEY, null)
        } catch (_: Throwable) {
            null
        }
        if (stored != null) return Language.fromCode(stored)
        // Until a language is picked, follow Discord's own language setting, then the system language
        return LanguageSync.currentDiscordLanguage() ?: Language.fromCode(Locale.getDefault().language)
    }

    /** Whether the user picked a language themselves, rather than following the system language. */
    @JvmStatic
    val hasExplicitLanguage: Boolean
        get() = Main.settings?.exists(LANGUAGE_KEY) == true

    /**
     * Translates [key] into the current language.
     * The key is the English text, which is also what gets returned when no translation exists.
     */
    @JvmStatic
    fun t(key: String): String {
        val lang = language
        if (lang == Language.ENGLISH) return key
        return table(lang, I18nData.CORE)[key] ?: key
    }

    /**
     * Translates [key] and fills in `{name}` placeholders from [vars].
     *
     * ```kotlin
     * I18n.t("Found {count} plugin updates!", "count" to 3)
     * ```
     */
    @JvmStatic
    fun t(key: String, vararg vars: Pair<String, Any?>): String {
        var res = t(key)
        for ((name, value) in vars) res = res.replace("{$name}", value.toString())
        return res
    }

    /** Java friendly variant of [t] taking alternating placeholder names and values. */
    @JvmStatic
    fun format(key: String, vararg namesAndValues: Any?): String {
        var res = t(key)
        var i = 0
        while (i + 1 < namesAndValues.size) {
            res = res.replace("{${namesAndValues[i]}}", namesAndValues[i + 1].toString())
            i += 2
        }
        return res
    }

    /** The translated description of the built-in plugin [pluginName], or [fallback] when there is none. */
    @JvmStatic
    fun pluginDescription(pluginName: String, fallback: String): String {
        val lang = language
        if (lang == Language.ENGLISH) return fallback
        // A translation of the exact English text wins: ports whose mobile description differs from Endcord PC's
        // ship their own translation of it, while unchanged descriptions use Endcord PC's table by plugin name.
        return table(lang, I18nData.CORE)[fallback]
            ?: table(lang, I18nData.PLUGINS)[pluginName]
            ?: fallback
    }

    /** Drops the cached language so the next lookup re-reads it from settings. */
    @JvmStatic
    fun invalidate() {
        cachedLanguage = null
    }

    private fun table(lang: Language, kind: Int): Map<String, String> {
        val cacheKey = "${lang.code}:$kind"
        tables[cacheKey]?.let { return it }

        synchronized(tables) {
            tables[cacheKey]?.let { return it }
            val parsed = try {
                parse(I18nData.chunks(lang.code, kind))
            } catch (e: Throwable) {
                logger.error("Failed to load ${lang.englishName} translations", e)
                emptyMap()
            }
            tables[cacheKey] = parsed
            return parsed
        }
    }

    /** Chunks hold `key \u0001 value \u0002` records, split so no single string constant gets too large. */
    private fun parse(chunks: Array<String>): Map<String, String> {
        val map = HashMap<String, String>(chunks.sumOf { it.length } / 48)
        val joined = if (chunks.size == 1) chunks[0] else chunks.joinToString("")
        var start = 0
        while (start < joined.length) {
            val sep = joined.indexOf('\u0001', start)
            if (sep < 0) break
            var end = joined.indexOf('\u0002', sep + 1)
            if (end < 0) end = joined.length
            map[joined.substring(start, sep)] = joined.substring(sep + 1, end)
            start = end + 1
        }
        return map
    }
}

/** Shorthand for [I18n.t]. */
fun tr(key: String): String = I18n.t(key)

/** Shorthand for [I18n.t] with placeholders. */
fun tr(key: String, vararg vars: Pair<String, Any?>): String = I18n.t(key, *vars)
