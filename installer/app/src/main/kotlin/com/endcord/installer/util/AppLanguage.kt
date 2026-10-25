/*
 * This file is part of Endcord Installer.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.installer.util

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import android.os.LocaleList
import androidx.annotation.StringRes
import com.endcord.installer.R
import java.util.Locale

/**
 * The installer speaks the same five languages as Endcord. The choice is stored in the app's preferences and
 * applied by wrapping the base context of the application and every activity, which works on every Android
 * version the installer supports.
 */
object AppLanguage {
    /** A selectable language. An empty [code] follows the system language. */
    data class Option(val code: String, val nativeName: String, @StringRes val region: Int)

    val options = listOf(
        Option("", "", R.string.language_system),
        Option("en", "English", R.string.language_region_en),
        Option("tr", "Türkçe", R.string.language_region_tr),
        Option("ru", "Русский", R.string.language_region_ru),
        Option("es", "Español", R.string.language_region_es),
        Option("fr", "Français", R.string.language_region_fr),
    )

    private const val PREFS = "preferences"
    private const val KEY = "language"

    /** The stored language code, read straight from the preferences since this runs before Koin starts. */
    fun storedCode(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "") ?: ""

    /** Returns [base] with the stored language applied, or [base] itself when following the system. */
    fun wrap(base: Context): Context {
        val code = storedCode(base)
        if (code.isEmpty()) return base

        val locale = Locale.forLanguageTag(code)
        Locale.setDefault(locale)
        val config = Configuration(base.resources.configuration)
        config.setLocales(LocaleList(locale))
        return base.createConfigurationContext(config)
    }

    /**
     * Applies a newly stored language: the application resources (used for toasts and notifications) are
     * updated in place and the activity behind [context] is recreated so every screen picks it up.
     */
    @Suppress("DEPRECATION")
    fun restart(context: Context) {
        val app = context.applicationContext
        val code = storedCode(app)
        val locale = if (code.isEmpty()) LocaleList.getDefault()[0] else Locale.forLanguageTag(code)
        Locale.setDefault(locale)
        val config = Configuration(app.resources.configuration)
        config.setLocales(LocaleList(locale))
        app.resources.updateConfiguration(config, app.resources.displayMetrics)

        var ctx: Context? = context
        while (ctx is android.content.ContextWrapper) {
            if (ctx is Activity) {
                ctx.recreate()
                return
            }
            ctx = ctx.baseContext
        }
    }
}
