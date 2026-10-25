package com.endcord.installer.manager

import android.content.SharedPreferences
import androidx.compose.runtime.Stable
import com.endcord.installer.manager.base.BasePreferenceManager
import com.endcord.installer.ui.theme.Theme

@Stable
class PreferencesManager(preferences: SharedPreferences) : BasePreferenceManager(preferences) {
    var theme by enumPreference("theme", Theme.Dark)
    var dynamicColor by booleanPreference("dynamic_color", false)

    /** Language code picked in the installer, or empty to follow the system language. */
    var language by stringPreference("language", "")

    /** Whether the language was chosen on the first-run welcome screen yet. */
    var languageChosen by booleanPreference("language_chosen", false)
    var devMode by booleanPreference("dev_mode", false)
    var installer by enumPreference<InstallerSetting>("installer", InstallerSetting.PackageInstaller)
    var keepPatchedApks by booleanPreference("keep_patched_apks", false)
    var showNetworkWarning by booleanPreference("show_network_warning", true)
    var showPlayProtectWarning by booleanPreference("show_play_protect_warning", true)
}
