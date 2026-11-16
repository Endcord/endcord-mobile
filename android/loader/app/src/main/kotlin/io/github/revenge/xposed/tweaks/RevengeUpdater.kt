package io.github.revenge.xposed.tweaks

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.SharedPreferences
import android.os.Looper
import android.widget.Toast
import io.github.revenge.logger
import io.github.revenge.reloadApp
import io.github.revenge.xposed.*
import io.github.revenge.xposed.tweaks.base.withAppActivity
import io.github.revenge.xposed.tweaks.plugins.internal.showRecoveryAlert
import io.github.revenge.xposed.tweaks.plugins.repos.REPO_URL_RULE
import io.github.revenge.xposed.tweaks.plugins.repos.isRepoUrl
import io.github.revenge.xposed.tweaks.plugins.repos.sha256Hex
import io.ktor.client.plugins.ResponseException
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import java.io.File
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.time.Duration.Companion.minutes
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
 * Whether a bundle without a signed release may run: only in a build that doesn't require one, and only until this
 * install has accepted a signed release. After that, a release that can't be fetched or a saved bundle without one is
 * refused rather than let through, so keeping the release files from arriving isn't a way to run unsigned code.
 */
internal fun unsignedReleaseAllowed(requireSigned: Boolean, acceptedSequence: Long) = !requireSigned && acceptedSequence <= 0L

/**
 * Updater for the JS bundle.
 *
 * Handles configuration, downloading, caching, and user-facing retry/recovery dialogs.
 * The actual loading of the bundle is handled by [revengeScriptLoader].
 */
object RevengeUpdater {
    /**
     * How long the server may take to connect and to go quiet ([getWithETag]): a download that keeps coming isn't cut off.
     * The first start waits for the download only this long ([revengeScriptLoader]); the download itself goes on.
     */
    internal val TIMEOUT = 10.seconds
    /** With a saved bundle the check runs while Discord starts from it, so it can wait out a slow network */
    private val TIMEOUT_CACHED = 15.seconds
    /** How long a start waits for the answer about a custom bundle link once the dialog shows */
    private val CUSTOM_URL_ANSWER_TIMEOUT = 2.minutes
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
    /** The link the saved bundle was fetched from, and its ETag ([parseSavedSource]) */
    private lateinit var etag: File
    private lateinit var configFile: File
    private lateinit var releaseManifest: File
    private lateinit var releaseSignature: File
    /**
     * The highest release sequence this install has accepted: in a file outside the cache, so clearing it doesn't reset
     * it, and in the app's preferences once there's a Context, which a plugin can't reach ([ReleaseSequence])
     */
    private lateinit var releaseSequence: ReleaseSequence
    /** Sets a new bundle that doesn't come up aside and puts the one before it back (BundleBootGuard.kt) */
    private lateinit var bootGuard: BundleBootGuard

    @Volatile
    private var prefs: SharedPreferences? = null

    /** Whether the app Endcord runs in is a developer's own build ([isDebuggable]): the custom link needs no asking */
    @Volatile
    private var hostDebuggable = false

    /**
     * The custom bundle link the user allowed in this process, in the dialog ([askAboutCustomUrl]). In memory only, never
     * on disk: what a plugin could write to make the loader take it can't be what decides it.
     */
    @Volatile
    private var allowedCustomUrl: String? = null

    /** Where the bundle that runs came from, for Endcord's security page */
    @Volatile
    var loadedFrom: String = "none"
        private set

    /** What was checked about the bundle that runs, decided as it's loaded; see [loadedBundleKind] */
    @Volatile
    private var loadedKind: String = "none"

    /** Whether this start put the previous bundle back, because the new one didn't come up */
    @Volatile
    var rolledBack = false
        private set

    /**
     * SHA-256 of the downloaded bundle that runs in this process, when the boot guard watches it: its JavaScript
     * confirms it once Discord stays up, and the guard keeps it to go back to even after a newer one is written
     */
    @Volatile
    private var loadedHash: String? = null

    private val _downloadReady = CompletableDeferred<Unit>()

    /**
     * Completes after the *first* download attempt finishes (success or any terminal failure).
     * [revengeScriptLoader] joins on this before falling through to its fallback bundle.
     */
    val downloadReady: Deferred<Unit> = _downloadReady

    /** One download at a time: one for a custom link allowed meanwhile mustn't be written over by one started before */
    private val downloadLock = Mutex()

    private val customUrlAsked = AtomicBoolean(false)
    /** Completes once the dialog about the custom link is on screen */
    private val customUrlShown = CompletableDeferred<Unit>()
    /** The user's answer about the custom link: true to load from it, false to turn it off */
    private val customUrlAnswer = CompletableDeferred<Boolean>()
    @Volatile
    private var customUrlDownload: Job? = null

    /**
     * [debuggable]: whether the app Endcord runs in is a developer's own build. The tweak passes its flag; without one
     * (the JVM unit tests, which have no app) it's taken as one off Android only, so a call that forgets it is strict.
     */
    internal fun init(dataDir: String, debuggable: Boolean = !runsOnAndroid) {
        val cacheDir = File(dataDir, RevengeConstants.CACHE_DIR).apply { mkdirs() }
        val filesDir = File(dataDir, RevengeConstants.FILES_DIR).apply { mkdirs() }

        hostDebuggable = debuggable
        bundle = File(cacheDir, RevengeConstants.MAIN_SCRIPT_FILE)
        manifest = File(cacheDir, RevengeConstants.BUNDLE_MANIFEST_FILE)
        etag = File(cacheDir, ETAG_PATH)
        configFile = File(filesDir, CONFIG_PATH)
        releaseManifest = File(cacheDir, RELEASE_MANIFEST)
        releaseSignature = File(cacheDir, RELEASE_SIGNATURE)
        val sequenceFile = File(filesDir, RELEASE_SEQUENCE)
        releaseSequence = ReleaseSequence(listOf(FileSequenceStore(sequenceFile), PrefsSequenceStore { prefs }))
        // On Android the bundle to go back to is noted in the loader's preferences (PrefsTrustedPrevious); the JVM unit
        // tests have no app to open them with, and test that check on BundleBootGuard itself (BootGuardTrustTest)
        bootGuard = BundleBootGuard(cacheDir, trusted = if (runsOnAndroid) PrefsTrustedPrevious { prefs } else null)
        // Written with AtomicFile before, which on Android 7 to 10 leaves a write cut short to its own reader to undo
        for (file in listOf(bundle, manifest, releaseManifest, releaseSignature, sequenceFile)) {
            runCatching { file.restoreInterruptedAtomicFile() }
        }

        config = runCatching {
            if (configFile.exists()) RevengeJson.decodeFromString<LoaderConfig>(configFile.readText())
            else LoaderConfig()
        }.getOrDefault(LoaderConfig())
        if (config.customLoadUrl.enabled && configuredCustomUrl() == null) {
            log.w("The custom bundle URL $REPO_URL_RULE; loading the published bundle instead: '${config.customLoadUrl.url}'")
        } else if (customUrlWaiting()) {
            log.w("A custom bundle URL is set; the published bundle loads until it's allowed: '${config.customLoadUrl.url}'")
        }
    }

    /** Once the app's Context exists: the second copy of the release sequence, brought up to the highest one */
    internal fun attachContext(ctx: Context) {
        prefs = runCatching { ctx.getSharedPreferences(PrefsSequenceStore.PREFS_NAME, Context.MODE_PRIVATE) }
            .onFailure { log.e("Couldn't open the loader's preferences", it) }
            .getOrNull()
        runCatching { releaseSequence.sync() }.onFailure { log.e("Couldn't keep the release sequence", it) }
    }

    /** The custom bundle link the config turns on, when it's a link that may be fetched from at all */
    private fun configuredCustomUrl(): String? = config.customLoadUrl.takeIf { it.enabled }?.url?.takeIf { isRepoUrl(it) }

    /**
     * The custom bundle URL, when it's in use ([customUrlInUse]): the user's own choice of what runs, but only from where
     * nobody on the way can change it, as for addons and plugin repositories. Anything else leaves the published, signed
     * bundle. The one place that decides it.
     */
    private fun customUrl(): String? {
        val url = configuredCustomUrl()
        return url.takeIf { customUrlInUse(enabled = url != null, debuggable = hostDebuggable, approved = url != null && url == allowedCustomUrl) }
    }

    /** Whether a custom bundle link is set but not allowed in this process: until it is, the published bundle loads */
    fun customUrlWaiting(): Boolean = configuredCustomUrl() != null && customUrl() == null

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
     * As the published bundle, only one fetched from where that's published ([savedBundleMayRunAsPublished]).
     */
    fun hasUsableBundle(): Boolean {
        if (!hasBundle()) return false
        val saved = HermesBytecode.versionOf(bundle)
        if (saved != null && saved != bytecodeVersion) return false
        if (!loadsPublishedBundle()) return true
        return savedBundleMayRunAsPublished(savedSource()?.url, customUrlWaiting()) { isPublishedBundleUrl(it, DEFAULT_BUNDLE_URL) } &&
            savedBundleIsSigned()
    }

    private fun loadsPublishedBundle() = customUrl() == null

    /** Under the lock the boot guard changes the bundle and its release under, so they're read as one */
    private fun <T> withBundleLock(block: () -> T): T = if (::bootGuard.isInitialized) bootGuard.withLock(block) else block()

    /** The name a release lists [bytes] under: the bytecode by its version, or the plain JS bundle's */
    private fun publishedName(bytes: ByteArray): String {
        val version = HermesBytecode.versionOf(bytes)
        return if (version != null) "endcord.v$version.hbc" else DEFAULT_BUNDLE_URL.substringAfterLast('/')
    }

    /** Whether the saved release's signature is valid and it lists [bytes] as the bundle they are */
    private fun savedReleaseLists(bytes: ByteArray): Boolean {
        if (!releaseManifest.isFile || !releaseSignature.isFile) return false
        val release = BundleRelease.parse(releaseManifest.readBytes(), releaseSignature.readBytes()) ?: return false
        return release.lists(publishedName(bytes), bytes)
    }

    /**
     * Whether the saved bundle is one a signed release listed. The check on download doesn't cover a file that's changed
     * afterwards. Until builds are made strict ([BuildConfig.REQUIRE_SIGNED]) a bundle without a release is let through.
     */
    private fun savedBundleIsSigned(): Boolean = withBundleLock {
        if (!releaseManifest.isFile || !releaseSignature.isFile) unsignedReleaseAllowed(BuildConfig.REQUIRE_SIGNED, acceptedSequence())
        else savedReleaseLists(bundle.readBytes())
    }

    private class SignedRelease(val release: BundleRelease, val manifest: ByteArray, val signature: ByteArray)

    /** The server's release, checked before any bundle is taken; null when it has none and that's allowed */
    private suspend fun fetchRelease(timeoutMillis: Long?): SignedRelease? {
        val folder = DEFAULT_BUNDLE_URL.substringBeforeLast('/')
        val manifest = fetchOptional("$folder/$RELEASE_MANIFEST", timeoutMillis, DownloadLimits.RELEASE_FILE)
        val signature = fetchOptional("$folder/$RELEASE_SIGNATURE", timeoutMillis, DownloadLimits.RELEASE_FILE)
        if (manifest == null || signature == null) {
            if (!unsignedReleaseAllowed(BuildConfig.REQUIRE_SIGNED, acceptedSequence())) throw SecurityException("No signed release could be fetched")
            return null
        }

        val release = BundleRelease.parse(manifest, signature)
            ?: throw SecurityException("The release's signature isn't valid")
        if (release.sequence < acceptedSequence()) throw SecurityException("The release is older than one already accepted")
        return SignedRelease(release, manifest, signature)
    }

    /** The highest release sequence accepted: the larger of its copies ([ReleaseSequence]) */
    fun acceptedSequence(): Long = if (::releaseSequence.isInitialized) releaseSequence.accepted() else 0L

    /**
     * Just before the downloaded bundle runs: counts the load, and puts the previous bundle back when the new one didn't
     * come up three times in a row. Whatever goes wrong here, the start goes on.
     *
     * Not for a bundle from the user's own link, which may never say it came up (upstream Revenge doesn't): it runs as it
     * is, however often, and nothing of it is counted.
     */
    fun beforeBundleLoad() {
        loadedHash = null
        if (!loadsPublishedBundle()) {
            rolledBack = false
            return
        }
        rolledBack = runCatching { bootGuard.beforeLoad(bundle, releaseFiles(), discardOnRollback = listOf(etag)) }
            .onFailure { log.e("The bundle's boot guard failed", it) }
            .getOrDefault(false)
        if (rolledBack) log.w("The new bundle didn't come up ${BundleBootGuard.FAILED_LOADS_BEFORE_ROLLBACK} times; the previous one is back")
    }

    private fun releaseFiles() = listOf(releaseManifest, releaseSignature)

    /**
     * What ran: set by [revengeScriptLoader] just before it runs it. What's checked about the downloaded bundle is
     * decided here, from the files as they are now, so a release downloaded later doesn't change what the security page
     * says about the bundle that runs.
     */
    fun noteLoaded(from: String) {
        loadedFrom = from
        val bytes = if (from == "downloaded") runCatching { bundle.readBytes() }.getOrNull() else null
        // Confirmed only for the published bundle, the one the boot guard watches
        loadedHash = bytes?.takeIf { loadsPublishedBundle() }?.let(::sha256Hex)
        loadedKind = when {
            from != "downloaded" -> from
            // It only runs once hasUsableBundle checked it against the saved release, or found none and that's allowed;
            // so too while a custom link waits to be allowed, which loads the published bundle
            loadsPublishedBundle() -> if (releaseManifest.isFile && releaseSignature.isFile) "signed" else "unsigned"
            // The user's own link, which nothing is checked for; the saved release may list it all the same, as when
            // the published bundle still runs because the one from the link hasn't been downloaded yet
            bytes != null && runCatching { withBundleLock { savedReleaseLists(bytes) } }.getOrDefault(false) -> "signed"
            else -> "custom"
        }
    }

    /** The bundle's JavaScript says Discord came up with it */
    fun confirmLoadedBundle() {
        val hash = loadedHash ?: return
        runCatching { bootGuard.confirm(hash) }.onFailure { log.e("Couldn't confirm the bundle", it) }
    }

    /**
     * Whether the bundle that runs is one a signed release lists ("signed"), one let through without a release
     * ("unsigned"), one from the user's own link ("custom"), the built-in one, or none
     */
    fun loadedBundleKind(): String = loadedKind

    /** Whether a downloaded update that doesn't come up is replaced by the one before it: not for the user's own link */
    fun rollbackGuardsUpdates(): Boolean = loadsPublishedBundle()

    /** [maxBytes]: from [DownloadLimits]; a body over it is an error, not a file the server doesn't have */
    private suspend fun fetchOptional(url: String, timeoutMillis: Long?, maxBytes: Long): ByteArray? = try {
        (httpClient.getWithETag(url = url, etag = null, timeoutMillis = timeoutMillis, maxBytes = maxBytes) as? ETagFetchResult.Fetched)?.bytes
    } catch (e: DownloadTooLargeException) {
        throw e
    } catch (e: ResponseException) {
        null
    } catch (e: IOException) {
        null
    }

    /** What a release let through is remembered, along with the release, for the checks on later starts */
    private fun keepRelease(signed: SignedRelease) {
        // Read plainly, so written whole or not at all
        releaseManifest.writeBytesAtomically(signed.manifest)
        releaseSignature.writeBytesAtomically(signed.signature)
        // In every copy, never lowered ([ReleaseSequence])
        releaseSequence.accept(signed.release.sequence)
    }

    /**
     * Where to fetch the bundle from, in order: a custom URL alone, or else the bundle precompiled for this Discord's
     * Hermes bytecode version and then the plain JS one, for versions no precompiled bundle is published for.
     */
    private fun bundleUrls(): List<String> {
        customUrl()?.let { return listOf(it) }
        val bytecode = bytecodeVersion?.let { DEFAULT_BUNDLE_URL.substringBeforeLast('/') + "/endcord.v$it.hbc" }
        return listOfNotNull(bytecode, DEFAULT_BUNDLE_URL)
    }

    /** The URL the saved bundle came from and its ETag, if it has one ([parseSavedSource]) */
    private fun savedSource(): SavedSource? {
        if (!::etag.isInitialized || !etag.exists() || !hasBundle()) return null
        return runCatching { parseSavedSource(etag.readText(), DEFAULT_BUNDLE_URL) }.getOrNull()
    }

    /**
     * Trigger a download. If [userInitiated] is true (retry from the error dialog), the timeout
     * is disabled and a success dialog is shown on the next available activity.
     */
    fun downloadScript(userInitiated: Boolean = false, showDialog: Boolean = true): Job = scope.launch {
        try {
            downloadLock.withLock { download(userInitiated, showDialog) }
        } catch (e: Throwable) {
            log.e("Failed to download script", e)
            // With a downloaded copy Endcord still starts, so a failed update check (offline, say) stays quiet
            if (userInitiated || !hasUsableBundle()) showErrorDialog(e)
        } finally {
            _downloadReady.complete(Unit)
        }
    }

    private suspend fun download(userInitiated: Boolean, showDialog: Boolean) {
        val urls = bundleUrls()
        val saved = savedSource()
        val timeout = if (userInitiated) null
        else if (hasUsableBundle()) TIMEOUT_CACHED.inWholeMilliseconds else TIMEOUT.inWholeMilliseconds
        val published = loadsPublishedBundle()
        val signed = if (published) fetchRelease(timeout) else null
        // Checked and kept under the boot guard's lock: a rollback at start mustn't put another bundle back between
        if (signed != null && hasUsableBundle() && bootGuard.withLock {
                val current = bundle.readBytes()
                signed.release.lists(publishedName(current), current).also { if (it) keepRelease(signed) }
            }
        ) {
            log.i("The saved bundle is the latest release")
            return
        }

        for ((index, url) in urls.withIndex()) {
            log.i("Fetching bundle from: $url")
            val name = url.substringAfterLast('/')
            val result = try {
                // A release's own address first, which the CDN can't answer with an older build; the branch's is
                // what's left when that one's gone, and the release still decides what's taken from it
                signed?.release?.pinnedUrlOf(name)?.let { fetchOptional(it, timeout, DownloadLimits.BUNDLE) }
                    ?.let { ETagFetchResult.Fetched(it, null) }
                    ?: httpClient.getWithETag(
                        url = url,
                        // A release says for itself whether the saved bundle is current
                        etag = saved?.takeIf { signed == null && it.url == url }?.etag,
                        timeoutMillis = timeout,
                        maxBytes = DownloadLimits.BUNDLE,
                    )
            } catch (e: ResponseException) {
                // No precompiled bundle for this Discord: the plain one is next
                if (e.response.status == HttpStatusCode.NotFound && index < urls.lastIndex) continue
                throw e
            }

            when (result) {
                is ETagFetchResult.Fetched -> {
                    // As the file it was fetched as: a release lists other files too (the loader's APK, say)
                    if (signed != null && !signed.release.lists(name, result.bytes)) {
                        if (index < urls.lastIndex) continue
                        throw SecurityException("The bundle isn't the signed release's")
                    }
                    val write = {
                        bundle.writeBytesAtomically(result.bytes)
                        signed?.let(::keepRelease)
                        // The link it came from, with or without an ETag: the published path never takes a bundle from
                        // a custom link for its own (savedBundleMayRunAsPublished)
                        etag.writeText(savedSourceText(url, result.etag))
                        Unit
                    }
                    if (!published) {
                        // The user's own link: the boot guard isn't for it, though it's written under its lock too
                        bootGuard.withLock(write)
                    } else if (!bootGuard.replace(bundle, releaseFiles(), result.bytes, running = loadedHash, write = write)) {
                        // A bundle that didn't come up and was set aside isn't taken again yet: the one there stays
                        log.w("This bundle didn't come up before; keeping the one there is for now")
                        break
                    }

                    log.i("Bundle updated (${result.bytes.size} bytes)")

                    downloadManifest()

                    if (userInitiated) showSuccessDialog()
                    // Endcord already started from the copy it had, or without one when the first download outlasted
                    // the wait for it: the update applies on a reload
                    else if (showDialog || bundleLoaded || loadedFrom == "builtin") showUpdateDialog()
                }

                ETagFetchResult.NotModified -> log.i("Server responded with 304, no changes")
            }
            break
        }
    }

    private suspend fun downloadManifest() {
        val manifestUrl = config.customLoadUrl.takeIf { customUrl() != null }?.manifestUrl?.takeIf { isRepoUrl(it) }
            ?: return

        try {
            val result = httpClient.getWithETag(url = manifestUrl, etag = null, timeoutMillis = null, maxBytes = DownloadLimits.BUNDLE_MANIFEST)
            if (result is ETagFetchResult.Fetched) {
                manifest.writeBytesAtomically(result.bytes)
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

    /**
     * What the loader trusts and so only it may write: the file bridge refuses to write or delete any of it
     * (bridge/BridgeFsPolicy.kt). The preloads folder, the loader config, the saved bundle and the files kept with it
     * (its link and ETag, its manifest), the signed release and the accepted release sequence, and the boot guard's
     * state and the bundles it keeps to put back.
     */
    internal fun protectedPaths(dataDir: String): List<File> {
        val cacheDir = File(dataDir, RevengeConstants.CACHE_DIR)
        val filesDir = File(dataDir, RevengeConstants.FILES_DIR)
        return listOf(
            File(filesDir, RevengeConstants.PRELOADS_DIR),
            File(filesDir, CONFIG_PATH),
            File(filesDir, RELEASE_SEQUENCE),
            File(cacheDir, RevengeConstants.MAIN_SCRIPT_FILE),
            File(cacheDir, ETAG_PATH),
            File(cacheDir, RevengeConstants.BUNDLE_MANIFEST_FILE),
            File(cacheDir, RELEASE_MANIFEST),
            File(cacheDir, RELEASE_SIGNATURE),
        ) + BundleBootGuard.ownedPaths(cacheDir)
    }

    /**
     * Once per process, when a custom bundle link waits to be allowed ([customUrlWaiting]): asks whether to load from it.
     * Only the user can answer, as a plugin can't press a native dialog's buttons.
     */
    fun askAboutCustomUrl(activity: Activity) {
        val url = configuredCustomUrl() ?: return
        if (!customUrlWaiting() || !customUrlAsked.compareAndSet(false, true)) return
        activity.runOnUiThread {
            try {
                AlertDialog.Builder(activity)
                    .setTitle(Strings["custom_url_title"])
                    .setMessage(Strings.format("custom_url_message", url))
                    // Answered with one of its buttons only: not by tapping outside it, nor with back
                    .setCancelable(false)
                    .setPositiveButton(Strings["custom_url_allow"]) { d, _ -> d.dismiss(); allowCustomUrl(url) }
                    .setNegativeButton(Strings["custom_url_turn_off"]) { d, _ -> d.dismiss(); turnOffCustomUrl() }
                    .show()
                customUrlShown.complete(Unit)
            } catch (e: Throwable) {
                log.e("Couldn't ask about the custom bundle link", e)
            }
        }
    }

    /**
     * "Load from this link": allowed for this process, and fetched. When something already runs, the update dialog then
     * offers the reload, as for any update; a start still waiting for this answer ([awaitCustomUrlAnswer]) runs it at
     * once. A reload is a new process, which asks again.
     */
    private fun allowCustomUrl(url: String) {
        allowedCustomUrl = url
        log.i("The custom bundle URL is allowed for this start: $url")
        customUrlDownload = downloadScript(userInitiated = false, showDialog = loadedFrom != "none")
        customUrlAnswer.complete(true)
    }

    /** "Turn it off": the config is written with the custom link off; the published bundle stays */
    private fun turnOffCustomUrl() {
        runCatching {
            configFile.writeBytesAtomically(configWithCustomUrlOff(configFile.takeIf { it.isFile }?.readText()).toByteArray())
        }.onFailure { log.e("Couldn't turn the custom bundle URL off in the loader config", it) }
        config = config.copy(customLoadUrl = config.customLoadUrl.copy(enabled = false))
        log.i("The custom bundle URL is turned off")
        customUrlAnswer.complete(false)
    }

    /**
     * For [revengeScriptLoader], before anything runs: when a custom link waits to be allowed, the user gets to answer
     * first, so allowing it applies to this start (what's allowed lasts only as long as the process, and a reload starts
     * a new one). Not on the main thread, which the dialog needs; and only once the dialog shows, which a start without an
     * Activity (for a notification, say) never does: those load the published bundle, as do answers that take too long.
     */
    fun awaitCustomUrlAnswer() {
        if (!customUrlWaiting()) return
        if (Looper.getMainLooper()?.isCurrentThread != false) return
        runBlocking<Unit> {
            withTimeoutOrNull(TIMEOUT) { customUrlShown.await() } ?: return@runBlocking
            val allowed = withTimeoutOrNull(CUSTOM_URL_ANSWER_TIMEOUT) { customUrlAnswer.await() } ?: return@runBlocking
            if (allowed) withTimeoutOrNull(TIMEOUT * 2) { customUrlDownload?.join() }
        }
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
    RevengeUpdater.init(appInfo.dataDir, debuggable = appInfo.isDebuggable)

    withAppContext { ctx ->
        RevengeUpdater.attachContext(ctx)
        RevengeUpdater.bytecodeVersion = HermesBytecode.version(ctx)
        RevengeUpdater.downloadScript(userInitiated = false, showDialog = false)
    }

    withAppActivity { activity -> RevengeUpdater.askAboutCustomUrl(activity) }
}
