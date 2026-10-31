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
import io.ktor.client.plugins.ResponseException
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.*
import kotlinx.serialization.Serializable
import java.io.File
import java.io.IOException
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
    private const val RELEASE_MANIFEST = "endcord-release.json"
    private const val RELEASE_SIGNATURE = "endcord-release.sig"
    private const val RELEASE_SEQUENCE = "release-sequence"
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
    private lateinit var releaseManifest: File
    private lateinit var releaseSignature: File
    /** The highest release sequence this install has accepted: outside the cache, so clearing it doesn't reset it */
    private lateinit var releaseSequence: File

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
        releaseManifest = File(cacheDir, RELEASE_MANIFEST)
        releaseSignature = File(cacheDir, RELEASE_SIGNATURE)
        releaseSequence = File(filesDir, RELEASE_SEQUENCE)

        config = runCatching {
            if (configFile.exists()) RevengeJson.decodeFromString<LoaderConfig>(configFile.readText())
            else LoaderConfig()
        }.getOrDefault(LoaderConfig())
    }

    fun resetLoaderConfig() {
        if (::configFile.isInitialized && configFile.exists()) configFile.delete()
    }

    /** Set by [revengeScriptLoader] just before it runs the downloaded bundle: an update that lands later waits */
    @Volatile
    var bundleLoaded = false

    /** Discord's Hermes bytecode version, read once the app's context exists */
    @Volatile
    var bytecodeVersion: Int? = null

    private fun hasBundle() = ::bundle.isInitialized && bundle.isFile && bundle.length() > 0

    /**
     * Whether the saved bundle can run in this Discord: plain JS always can, bytecode only on the version it was
     * compiled for. After Discord moves to a newer Hermes, the bytecode saved for the old one is as good as missing.
     */
    fun hasUsableBundle(): Boolean {
        if (!hasBundle()) return false
        val saved = HermesBytecode.versionOf(bundle)
        if (saved != null && saved != bytecodeVersion) return false
        return !loadsPublishedBundle() || savedBundleIsSigned()
    }

    private fun loadsPublishedBundle() = !config.customLoadUrl.enabled

    /**
     * Whether the saved bundle is one a signed release listed. The check on download doesn't cover a file that's changed
     * afterwards. Until builds are made strict ([BuildConfig.REQUIRE_SIGNED]) a bundle without a release is let through.
     */
    private fun savedBundleIsSigned(): Boolean {
        if (!releaseManifest.isFile || !releaseSignature.isFile) return !BuildConfig.REQUIRE_SIGNED
        val release = BundleRelease.parse(releaseManifest.readBytes(), releaseSignature.readBytes())
        return release != null && bundle.readBytes() in release
    }

    private class SignedRelease(val release: BundleRelease, val manifest: ByteArray, val signature: ByteArray)

    /** The server's release, checked before any bundle is taken; null when it has none and that's allowed */
    private suspend fun fetchRelease(timeoutMillis: Long?): SignedRelease? {
        val folder = DEFAULT_BUNDLE_URL.substringBeforeLast('/')
        val manifest = fetchOptional("$folder/$RELEASE_MANIFEST", timeoutMillis)
        val signature = fetchOptional("$folder/$RELEASE_SIGNATURE", timeoutMillis)
        if (manifest == null || signature == null) {
            if (BuildConfig.REQUIRE_SIGNED) throw SecurityException("No signed release could be fetched")
            return null
        }

        val release = BundleRelease.parse(manifest, signature)
            ?: throw SecurityException("The release's signature isn't valid")
        val accepted = runCatching { releaseSequence.readText().trim().toLong() }.getOrDefault(0)
        if (release.sequence < accepted) throw SecurityException("The release is older than one already accepted")
        return SignedRelease(release, manifest, signature)
    }

    private suspend fun fetchOptional(url: String, timeoutMillis: Long?): ByteArray? = try {
        (httpClient.getWithETag(url = url, etag = null, timeoutMillis = timeoutMillis) as? ETagFetchResult.Fetched)?.bytes
    } catch (e: ResponseException) {
        null
    } catch (e: IOException) {
        null
    }

    /** What a release let through is remembered, along with the release, for the checks on later starts */
    private fun keepRelease(signed: SignedRelease) {
        AtomicFile(releaseManifest).writeBytes(signed.manifest)
        AtomicFile(releaseSignature).writeBytes(signed.signature)
        releaseSequence.writeText(signed.release.sequence.toString())
    }

    /**
     * Where to fetch the bundle from, in order: a custom URL alone, or else the bundle precompiled for this Discord's
     * Hermes bytecode version and then the plain JS one, for versions no precompiled bundle is published for.
     */
    private fun bundleUrls(): List<String> {
        config.customLoadUrl.takeIf { it.enabled }?.url?.let { return listOf(it) }
        val bytecode = bytecodeVersion?.let { DEFAULT_BUNDLE_URL.substringBeforeLast('/') + "/endcord.v$it.hbc" }
        return listOfNotNull(bytecode, DEFAULT_BUNDLE_URL)
    }

    /** The URL the saved bundle came from and its ETag, saved as two lines (one line: an ETag of the default URL) */
    private fun savedETag(): Pair<String, String>? {
        if (!etag.exists() || !hasBundle()) return null
        val lines = etag.readText().lines().filter { it.isNotBlank() }
        return when (lines.size) {
            1 -> DEFAULT_BUNDLE_URL to lines[0]
            2 -> lines[0] to lines[1]
            else -> null
        }
    }

    /**
     * Trigger a download. If [userInitiated] is true (retry from the error dialog), the timeout
     * is disabled and a success dialog is shown on the next available activity.
     */
    fun downloadScript(userInitiated: Boolean = false, showDialog: Boolean = true): Job = scope.launch {
        try {
            val urls = bundleUrls()
            val saved = savedETag()
            val timeout = if (userInitiated) null
            else if (hasUsableBundle()) TIMEOUT_CACHED.inWholeMilliseconds else TIMEOUT.inWholeMilliseconds
            val signed = if (loadsPublishedBundle()) fetchRelease(timeout) else null
            if (signed != null && hasUsableBundle() && bundle.readBytes() in signed.release) {
                log.i("The saved bundle is the latest release")
                keepRelease(signed)
                return@launch
            }

            for ((index, url) in urls.withIndex()) {
                log.i("Fetching bundle from: $url")
                val result = try {
                    httpClient.getWithETag(
                        url = url,
                        // A release says for itself whether the saved bundle is current
                        etag = saved?.takeIf { signed == null && it.first == url }?.second,
                        timeoutMillis = timeout,
                    )
                } catch (e: ResponseException) {
                    // No precompiled bundle for this Discord: the plain one is next
                    if (e.response.status == HttpStatusCode.NotFound && index < urls.lastIndex) continue
                    throw e
                }

                when (result) {
                    is ETagFetchResult.Fetched -> {
                        if (signed != null && result.bytes !in signed.release) {
                            if (index < urls.lastIndex) continue
                            throw SecurityException("The bundle isn't the signed release's")
                        }
                        AtomicFile(bundle).writeBytes(result.bytes)
                        signed?.let(::keepRelease)
                        result.etag?.let { etag.writeText("$url\n$it") } ?: etag.delete()

                        log.i("Bundle updated (${result.bytes.size} bytes)")

                        downloadManifest()

                        if (userInitiated) showSuccessDialog()
                        // Endcord already started from the copy it had: the update applies on a reload
                        else if (showDialog || bundleLoaded) showUpdateDialog()
                    }

                    ETagFetchResult.NotModified -> log.i("Server responded with 304, no changes")
                }
                break
            }
        } catch (e: Throwable) {
            log.e("Failed to download script", e)
            // With a downloaded copy Endcord still starts, so a failed update check (offline, say) stays quiet
            if (userInitiated || !hasUsableBundle()) showErrorDialog(e)
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
        RevengeUpdater.bytecodeVersion = HermesBytecode.version(ctx)
        RevengeUpdater.downloadScript(userInitiated = false, showDialog = false)
    }
}
