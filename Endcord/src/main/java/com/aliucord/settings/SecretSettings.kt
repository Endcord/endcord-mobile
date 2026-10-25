/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.aliucord.settings

import android.content.Context
import android.content.SharedPreferences
import com.aliucord.Utils
import com.aliucord.api.SettingsAPI

/**
 * Storage for text settings marked secret (API keys and the like). Plugin settings live in shared storage
 * (/sdcard/Endcord/settings), which on older Android versions any app with the storage permission can read, so
 * secrets go to the app's private preferences instead. They are left out of backups on purpose.
 */
internal object SecretSettings {
    private val prefs: SharedPreferences by lazy {
        Utils.appContext.getSharedPreferences("endcord_secrets", Context.MODE_PRIVATE)
    }

    private fun id(plugin: String, key: String) = "$plugin.$key"

    /** The secret [key] of [plugin]. A value still in the plugin's settings file (older versions) is moved over. */
    @JvmStatic
    fun get(plugin: String, key: String, settings: SettingsAPI, default: String): String {
        if (settings.exists(key)) {
            val legacy = settings.getString(key, default) ?: default
            prefs.edit().putString(id(plugin, key), legacy).apply()
            settings.remove(key)
            return legacy
        }
        return prefs.getString(id(plugin, key), default) ?: default
    }

    @JvmStatic
    fun set(plugin: String, key: String, value: String) {
        prefs.edit().putString(id(plugin, key), value).apply()
    }
}
