// Copyright (c) 2026 rootpoi and contributors
package app.revenge.manager.utils

import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import app.revenge.manager.installer.util.ApkSignature

/**
 * The official Discord app, if it is installed. Android only lets the app that signed Discord update it, so Endcord
 * can't change it in place; it is copied, patched and installed next to it as a separate app instead.
 *
 * Only Discord's own counts: any app can be installed as `com.discord` where Discord isn't, and its code would run as
 * Endcord, with the Discord account in it. One not signed by Discord is treated as no Discord at all, so it isn't
 * offered for building, by an update notification or on the home screen.
 */
object InstalledDiscord {
    const val PACKAGE = "com.discord"

    // GET_SIGNING_CERTIFICATES is a package info flag; lint loses track of it through toLong()
    @SuppressLint("WrongConstant")
    fun packageInfo(context: Context): PackageInfo? = try {
        val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager.getPackageInfo(
                PACKAGE,
                PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong())
            )
        } else {
            context.packageManager.getPackageInfo(PACKAGE, PackageManager.GET_SIGNING_CERTIFICATES)
        }
        info.takeIf { ApkSignature.isSignedByDiscord(it) }
    } catch (e: PackageManager.NameNotFoundException) {
        null
    }

    fun version(context: Context): DiscordVersion? = packageInfo(context)?.let {
        // minSdk 28: longVersionCode is always there
        DiscordVersion.fromVersionCode(it.longVersionCode.toString())
    }

    fun versionName(context: Context): String = packageInfo(context)?.versionName ?: "?"
}
