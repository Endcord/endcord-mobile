// Copyright (c) 2026 rootpoii and contributors
package app.revenge.manager.utils

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build

/**
 * The official Discord app, if it is installed. Android only lets the app that signed Discord update it, so Endcord
 * can't change it in place; it is copied, patched and installed next to it as a separate app instead.
 */
object InstalledDiscord {
    const val PACKAGE = "com.discord"

    fun packageInfo(context: Context): PackageInfo? = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager.getPackageInfo(PACKAGE, PackageManager.PackageInfoFlags.of(0L))
        } else {
            context.packageManager.getPackageInfo(PACKAGE, 0)
        }
    } catch (e: PackageManager.NameNotFoundException) {
        null
    }

    @Suppress("DEPRECATION")
    fun version(context: Context): DiscordVersion? = packageInfo(context)?.let {
        val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) it.longVersionCode.toString() else it.versionCode.toString()
        DiscordVersion.fromVersionCode(code)
    }

    fun versionName(context: Context): String = packageInfo(context)?.versionName ?: "?"
}
