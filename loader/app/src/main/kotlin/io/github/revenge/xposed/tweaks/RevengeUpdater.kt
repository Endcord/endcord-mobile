package io.github.revenge.xposed.tweaks

import android.app.AlertDialog
import android.util.AtomicFile
import android.widget.Toast
import androidx.core.util.writeBytes
import io.github.revenge.logger
import io.github.revenge.reloadApp
import io.github.revenge.xposed.*
import io.github.revenge.xposed.tweaks.base.withAppActivity
import io.github.revenge.xposed.tweaks.plugins.internal.showRecoveryAlert
import kotlinx.coroutines.*
import kotlinx.serialization.Serializable
import java.io.File
import kotlin.time.Duration.Companion.seconds

@Serializable
data class CustomLoadUrl(
    val enabled: Boolean = false,
    val url: String = "",
    val manifestUrl: String = "",
)

@Serializable
data class LoaderConfig(
    val customLoadUrl: CustomLoadUrl = CustomLoadUrl(),
)

/**
 * Updater for the JS bundle.
 *
 * Handles configuration, downloading, caching, and user-facing retry/recovery dialogs.
 * The actual loading of the bundle is handled by [revengeScriptLoader].
 */
object RevengeUpdater {
    internal val TIMEOUT = 10.seconds
    private val TIMEOUT_CACHED = 5.seconds
    private const val ETAG_PATH = "etag.txt"
    private const val CONFIG_PATH = "loader.json"
    /** Where the Endcord bundle is published; overridable at build time with `-Pendcord.bundleUrl=...` for testing. */
    private const val DEFAULT_BUNDLE_URL = BuildConfig.BUNDLE_URL

    private val log = logger("revengeUpdater")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Volatile
    private var config = LoaderConfig()
    private lateinit var bundle: File
    private lateinit var manifest: File
    private lateinit var etag: File
    private lateinit var configFile: File

    private val _downloadReady = CompletableDeferred<Unit>()

    /**
     * Completes after the *first* download attempt finishes (success or any terminal failure).
     * [revengeScriptLoader] joins on this before falling through to its fallback bundle.
     */
    val downloadReady: Deferred<Unit> = _downloadReady

    internal fun init(dataDir: String) {
        val cacheDir = File(dataDir, RevengeConstants.CACHE_DIR).apply { mkdirs() }
        val filesDir = File(dataDir, RevengeConstants.FILES_DIR).apply { mkdirs() }

        bundle = File(cacheDir, RevengeConstants.MAIN_SCRIPT_FILE)
        manifest = File(cacheDir, RevengeConstants.BUNDLE_MANIFEST_FILE)
        etag = File(cacheDir, ETAG_PATH)
        configFile = File(filesDir, CONFIG_PATH)

        config = runCatching {
            if (configFile.exists()) RevengeJson.decodeFromString<LoaderConfig>(configFile.readText())
            else LoaderConfig()
        }.getOrDefault(LoaderConfig())
    }

    fun resetLoaderConfig() {
        if (::configFile.isInitialized && configFile.exists()) configFile.delete()
    }

    /**
     * Trigger a download. If [userInitiated] is true (retry from the error dialog), the timeout
     * is disabled and a success dialog is shown on the next available activity.
     */
    fun downloadScript(userInitiated: Boolean = false, showDialog: Boolean = true): Job = scope.launch {
        try {
            val url = config.customLoadUrl.takeIf { it.enabled }?.url ?: DEFAULT_BUNDLE_URL
            log.i("Fetching JS bundle from: $url")

            val result = httpClient.getWithETag(
                url = url,
                etag = if (etag.exists() && bundle.exists()) etag.readText() else null,
                timeoutMillis = if (userInitiated) null
                else if (bundle.exists()) TIMEOUT_CACHED.inWholeMilliseconds else TIMEOUT.inWholeMilliseconds,
            )

            when (result) {
                is ETagFetchResult.Fetched -> {
                    AtomicFile(bundle).writeBytes(result.bytes)
                    result.etag?.let(etag::writeText) ?: etag.delete()

                    log.i("Bundle updated (${result.bytes.size} bytes)")

                    downloadManifest()

                    if (showDialog) {
                        if (userInitiated) showSuccessDialog() else showUpdateDialog()
                    }
                }

                ETagFetchResult.NotModified -> log.i("Server responded with 304, no changes")
            }
        } catch (e: Throwable) {
            log.e("Failed to download script", e)
            // With a downloaded copy Endcord still starts, so a failed update check (offline, say) stays quiet
            if (userInitiated || !bundle.exists()) showErrorDialog(e)
        } finally {
            _downloadReady.complete(Unit)
        }
    }

    private suspend fun downloadManifest() {
        val manifestUrl = config.customLoadUrl.takeIf { it.enabled }?.manifestUrl
            ?: return

        try {
            val result = httpClient.getWithETag(url = manifestUrl, etag = null, timeoutMillis = null)
            if (result is ETagFetchResult.Fetched) {
                AtomicFile(manifest).writeBytes(result.bytes)
                log.i("Bundle manifest updated (${result.bytes.size} bytes)")
            }
        } catch (e: Throwable) {
            log.w("Failed to download bundle manifest", e)
        }
    }

    fun readBundleManifest(): String? {
        if (manifest.exists()) return manifest.readText()
        return null
    }

    private fun showUpdateDialog() = withAppActivity { activity ->
        activity.runOnUiThread {
            AlertDialog.Builder(activity)
                .setTitle(Strings["update_downloaded_title"])
                .setMessage(Strings["reload_required"])
                .setPositiveButton(Strings["reload"]) { d, _ -> reloadApp(); d.dismiss() }
                .setNegativeButton(Strings["later"]) { d, _ -> d.dismiss() }
                .show()
        }
    }

    private fun showSuccessDialog() = withAppActivity { activity ->
        activity.runOnUiThread {
            AlertDialog.Builder(activity)
                .setTitle(Strings["update_success_title"])
                .setMessage(Strings["reload_required"])
                .setPositiveButton(Strings["reload"]) { d, _ -> reloadApp(); d.dismiss() }
                .setNegativeButton(Strings["later"]) { d, _ -> d.dismiss() }
                .show()
        }
    }

    private fun showErrorDialog(e: Throwable) = withAppActivity { activity ->
        activity.runOnUiThread {
            AlertDialog.Builder(activity)
                .setTitle(Strings["update_failed_title"])
                .setMessage(Strings["update_failed_message"] + "\n\n" + Strings.format("error", e.message ?: e.javaClass.simpleName))
                .setNegativeButton(Strings["dismiss"]) { d, _ -> d.dismiss() }
                .setPositiveButton(Strings["retry"]) { d, _ ->
                    downloadScript(userInitiated = true)
                    Toast.makeText(activity, Strings["retrying"], Toast.LENGTH_SHORT).show()
                    d.dismiss()
                }
                .setNeutralButton(Strings["recovery"]) { d, _ -> showRecoveryAlert(activity); d.dismiss() }
                .show()
        }
    }
}

/**
 * Wires [RevengeUpdater] into the lifecycle. Loads the loader config once the target [android.content.Context]
 * is available, then kicks off the first download.
 */
val revengeUpdater by tweak {
    RevengeUpdater.init(appInfo.dataDir)

    withAppContext { ctx ->
        RevengeUpdater.downloadScript(userInitiated = false, showDialog = false)
    }
}
