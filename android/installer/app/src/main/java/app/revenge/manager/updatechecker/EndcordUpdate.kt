// Copyright (c) 2026 rootpoi and contributors
package app.revenge.manager.updatechecker

import app.revenge.manager.BuildConfig
import app.revenge.manager.domain.manager.PreferenceManager
import app.revenge.manager.installer.step.download.DownloadModStep
import app.revenge.manager.installer.util.SignedRelease
import io.ktor.client.HttpClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/*
 * Endcord's JavaScript updates itself at every start; its loader, which runs inside the app, only changes when Endcord is
 * installed again. These tell when the published loader is newer than the one Endcord has, so installing again is offered
 * (the home screen) and said once (the update checker's notification).
 */

/** Whether [published] is another loader than [installed]: never when either isn't known */
internal fun isOtherLoader(installed: String, published: String?) =
    installed.isNotBlank() && !published.isNullOrBlank() && !installed.equals(published, ignoreCase = true)

/** Whether installs take the published, signed loader: not a module of the user's own (Developer settings) */
suspend fun PreferenceManager.usesPublishedLoader() = withContext(Dispatchers.IO) {
    runCatching { moduleLocation.canonicalFile == DEFAULT_MODULE_LOCATION.canonicalFile }.getOrDefault(false)
}

/**
 * The SHA-256 of the loader Endcord has: what the last install noted, or for an install by an installer before that
 * was noted, the signed loader that install downloaded, which stays in the installer's cache. Blank when unknown.
 */
suspend fun PreferenceManager.installedLoader(): String = installedLoaderSha256.ifBlank {
    withContext(Dispatchers.IO) {
        runCatching { DEFAULT_MODULE_LOCATION.takeIf { it.isFile }?.let { SignedRelease.sha256Hex(it) } }.getOrNull() ?: ""
    }
}

/** The SHA-256 of the loader in the newest signed release; throws when that can't be fetched or isn't valid */
suspend fun publishedLoader(http: HttpClient, prefs: PreferenceManager): String? {
    val accepted = prefs.releaseSequence.toLongOrNull() ?: 0
    return SignedRelease.fetch(http, BuildConfig.LOADER_URL, accepted).sha256Of(DownloadModStep.LOADER_FILE)
}

/**
 * The published loader's SHA-256 when it's not the one Endcord has, or null: also when that isn't known, or Endcord is
 * built with a module of the user's own
 */
suspend fun newerPublishedLoader(http: HttpClient, prefs: PreferenceManager): String? {
    if (!prefs.usesPublishedLoader()) return null
    val installed = prefs.installedLoader().ifBlank { return null }
    return publishedLoader(http, prefs)?.takeIf { isOtherLoader(installed, it) }
}
