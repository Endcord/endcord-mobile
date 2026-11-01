// Copyright (c) 2026 rootpoi and contributors
package app.revenge.manager.installer.step.download.base

import app.revenge.manager.installer.util.ApkSignature

/**
 * The download of one of Discord's own APKs, which is only taken with Discord's signature on it: a mirror, or anything
 * on the way from it, can't hand the installer another app to patch
 */
abstract class DiscordDownloadStep : DownloadStep() {

    override suspend fun verify() {
        super.verify()
        ApkSignature.requireDiscord(destination)
    }
}
