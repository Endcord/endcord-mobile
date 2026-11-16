package io.github.revenge.xposed.tweaks

import io.github.revenge.xposed.RevengeConstants
import io.github.revenge.xposed.ensureDir
import io.github.revenge.xposed.ensureFile
import io.github.revenge.xposed.isDebuggable
import io.github.revenge.xposed.tweak
import io.github.revenge.xposed.tweaks.base.InjectorScope
import io.github.revenge.xposed.tweaks.base.registerScriptInjector
import io.github.revenge.xposed.tweaks.plugins.repos.sha256Hex
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Waits for script updates and loads the Revenge bundle. Depends on [io.github.revenge.xposed.tweaks.base.scriptLoader].
 *
 * 1. Lets the user answer about a custom bundle link first, when one waits to be allowed ([RevengeUpdater.awaitCustomUrlAnswer]).
 * 2. Awaits the bundle download from [revengeUpdater].
 * 3. Runs the files under `files/pyoncord/preloads/`: in an app that isn't a developer's own build, only those Endcord
 *    itself puts there ([planPreloads]).
 * 4. Loads `cache/revenge/bundle.js` (downloaded copy) if present and, when it is bytecode, of this Discord's version.
 * 5. Falls back to the in-APK `assets://revenge.bundle` asset shipped with this module.
 */
val revengeScriptLoader by tweak {
    val dataDir = appInfo.dataDir
    val debuggable = appInfo.isDebuggable
    val filesDir = File(dataDir, RevengeConstants.FILES_DIR).apply { ensureDir() }
    val cacheDir = File(dataDir, RevengeConstants.CACHE_DIR).apply { ensureDir() }
    val preloadsDir = File(filesDir, RevengeConstants.PRELOADS_DIR).apply { ensureDir() }
    val mainScript = File(cacheDir, RevengeConstants.MAIN_SCRIPT_FILE).apply { ensureFile() }

    registerScriptInjector { scope: InjectorScope ->
        runRevengeScripts(scope, preloadsDir, mainScript, debuggable)
    }
}

/** Preloads already said to be refused in this process: each is logged once */
private val refusedPreloadsLogged = ConcurrentHashMap.newKeySet<String>()

private fun runRevengeScripts(scope: InjectorScope, preloadsDir: File, mainScript: File, debuggable: Boolean) {
    val log = scope.tweakLog
    log.i("Running Endcord custom scripts...")

    runCatching { RevengeUpdater.awaitCustomUrlAnswer() }.onFailure { log.w("Waiting for the custom bundle URL's answer failed", it) }

    // Discord's start waits here. With a downloaded copy, Endcord starts from it at once and the update check carries on
    // in the background (an update that lands asks to reload); only the very first start waits for the download, and
    // the first after Discord moved to a Hermes that the saved bytecode doesn't run on.
    if (!RevengeUpdater.hasUsableBundle()) runBlocking {
        try {
            withTimeout(RevengeUpdater.TIMEOUT) { RevengeUpdater.downloadReady.await() }
        } catch (e: Throwable) {
            log.w("Bundle download did not complete", e)
        }
    }

    try {
        val files = preloadsDir.walk().filter { it.isFile }.sorted().toList()
        val plan = planPreloads(files, debuggable, sha256Of = { runCatching { sha256Hex(it.readBytes()) }.getOrNull() })
        PreloadStatus.ran = plan.run.size
        PreloadStatus.refused = plan.refused.size
        for (f in plan.refused) {
            if (refusedPreloadsLogged.add(f.absolutePath)) {
                log.w("Not running a preload Endcord didn't put there (not a developer's own build of the app): ${f.absolutePath}")
            }
        }
        for (f in plan.run) {
            log.d("Running preload: ${f.absolutePath}")
            scope.runFile(f.absolutePath)
        }

        // A new bundle that didn't come up three times in a row is replaced by the one before it, before it runs again
        if (RevengeUpdater.hasUsableBundle()) RevengeUpdater.beforeBundleLoad()

        if (RevengeUpdater.hasUsableBundle()) {
            log.i("Loading downloaded bundle: ${mainScript.absolutePath}")
            RevengeUpdater.bundleLoaded = true
            RevengeUpdater.noteLoaded("downloaded")
            scope.runFile(mainScript.absolutePath)
        } else {
            log.i("No downloaded bundle that runs on this Discord; falling back to ${RevengeConstants.FALLBACK_BUNDLE_ASSET}")
            RevengeUpdater.noteLoaded("builtin")
            scope.runAsset(RevengeConstants.FALLBACK_BUNDLE_ASSET)
        }
    } catch (e: Throwable) {
        log.e("Unable to run Endcord scripts", e)
    }
}
