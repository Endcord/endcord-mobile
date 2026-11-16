// Copyright (c) 2026 rootpoi and contributors
package app.revenge.manager.installer.step.download.base

import app.revenge.manager.installer.util.ApkSignature
import app.revenge.manager.installer.util.DiscordApkManifest

/**
 * The download of one of Discord's own APKs, which is only taken with Discord's signature on it: a mirror, or anything
 * on the way from it, can't hand the installer another app to patch. It must also be the version and split asked for,
 * so a mirror can't hand over an older Discord, or splits of different versions, either.
 */
abstract class DiscordDownloadStep : DownloadStep() {

    /** The version code of the Discord this downloads */
    protected abstract val versionCode: String

    /** The split this downloads (`config.en`), or null for the base APK */
    protected abstract val split: String?

    override suspend fun verify() {
        super.verify()
        ApkSignature.requireDiscord(destination)
        DiscordApkManifest.require(destination, versionCode.toLong(), split)
    }
}
