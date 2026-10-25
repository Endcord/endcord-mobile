package com.endcord.installer.ui.screens.home

import android.app.Application
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.provider.Settings
import android.util.Log
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.core.graphics.drawable.toBitmap
import androidx.core.net.toUri
import cafe.adriel.voyager.core.model.ScreenModel
import cafe.adriel.voyager.core.model.screenModelScope
import com.endcord.installer.BuildConfig
import com.endcord.installer.R
import com.endcord.installer.network.models.BuildInfo
import com.endcord.installer.network.services.EndcordGithubService
import com.endcord.installer.network.services.AliucordMavenService
import com.endcord.installer.network.utils.SemVer
import com.endcord.installer.network.utils.fold
import com.endcord.installer.patcher.InstallMetadata
import com.endcord.installer.ui.screens.patchopts.PatchOptions
import com.endcord.installer.ui.screens.patchopts.PatchOptionsScreen
import com.endcord.installer.ui.util.DiscordVersion
import com.endcord.installer.ui.util.toUnsafeImmutable
import com.endcord.installer.util.*
import com.github.diamondminer88.zip.ZipReader
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromStream

class HomeModel(
    private val application: Application,
    private val github: EndcordGithubService,
    private val maven: AliucordMavenService,
    private val json: Json,
) : ScreenModel {
    var installsState by mutableStateOf<InstallsState>(InstallsState.Fetching)
        private set

    private val refreshingLock = Mutex()
    private var remoteDataJson: BuildInfo? = null
    private var latestAliuhookVersion: SemVer? = null

    init {
        refresh()
    }

    fun refresh(delay: Boolean = false) = screenModelScope.launchIO {
        if (refreshingLock.isLocked) return@launchIO

        if (delay) {
            delay(250)

            if (refreshingLock.isLocked)
                return@launchIO
        }

        refreshingLock.withLock {
            val packages = fetchEndcordPackages()

            val jobs = listOf(
                screenModelScope.launch(Dispatchers.IO) {
                    fetchInstallations(packages)
                },
                screenModelScope.launch(Dispatchers.IO) {
                    if (remoteDataJson == null || latestAliuhookVersion == null)
                        fetchRemoteData()
                }
            )

            jobs.joinAll()
            mainThread { refreshInstallationsUpToDate(packages) }
        }
    }

    fun openApp(packageName: String) {
        val launchIntent = application.packageManager
            .getLaunchIntentForPackage(packageName)

        if (launchIntent != null) {
            application.startActivity(launchIntent)
        } else {
            application.showToast(R.string.launch_endcord_fail)
        }
    }

    fun openAppInfo(packageName: String) {
        val launchIntent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            .setData("package:$packageName".toUri())

        application.startActivity(launchIntent)
    }

    /**
     * Creates a [PatchOptionsScreen] that can be navigated to,
     * with prefilled options from an existing installation.
     */
    fun createPrefilledPatchOptsScreen(packageName: String): PatchOptionsScreen {
        val metadata = try {
            val applicationInfo = application.packageManager.getApplicationInfo(packageName, 0)
            val metadataFile = ZipReader(applicationInfo.publicSourceDir)
                .use { it.openEntry("endcord.json")?.read() }

            metadataFile?.let { json.decodeFromStream<InstallMetadata>(it.inputStream()) }
        } catch (t: Throwable) {
            Log.w(BuildConfig.TAG, "Failed to parse Endcord install metadata from package $packageName", t)
            null
        }

        val patchOptions = metadata?.options
            ?: PatchOptions.Default.copy(packageName = packageName)

        return PatchOptionsScreen(prefilledOptions = patchOptions)
    }

    private suspend fun fetchInstallations(packages: List<PackageInfo>) {
        mainThread {
            if (installsState !is InstallsState.Fetched)
                installsState = InstallsState.Fetching
        }

        try {
            val packageManager = application.packageManager
            val endcordInstallations = packages.mapNotNull { pkg ->
                // `longVersionCode` is unnecessary since Discord doesn't use `versionCodeMajor`
                @Suppress("DEPRECATION")
                val versionCode = pkg.versionCode
                val versionName = pkg.versionName ?: return@mapNotNull null
                val applicationInfo = pkg.applicationInfo ?: return@mapNotNull null

                InstallData(
                    name = packageManager.getApplicationLabel(applicationInfo).toString(),
                    packageName = pkg.packageName,
                    isUpToDate = isInstallationUpToDate(pkg),
                    icon = packageManager
                        .getApplicationIcon(applicationInfo)
                        .toBitmap()
                        .asImageBitmap()
                        .let(::BitmapPainter),
                    version = DiscordVersion.Existing(
                        type = DiscordVersion.parseVersionType(versionCode),
                        name = versionName.split("-")[0].trim(),
                        code = versionCode,
                    ),
                )
            }

            mainThread {
                installsState = if (endcordInstallations.isNotEmpty()) {
                    InstallsState.Fetched(data = endcordInstallations.toUnsafeImmutable())
                } else {
                    InstallsState.None
                }
            }
        } catch (t: Throwable) {
            Log.e(BuildConfig.TAG, "Failed to query Aliucord installations", t)
            mainThread { installsState = InstallsState.Error }
        }
    }

    private suspend fun refreshInstallationsUpToDate(packages: List<PackageInfo>) {
        val installations = mainThread { (installsState as? InstallsState.Fetched)?.data }
            ?: return

        try {
            val newInstallations = installations.map { data ->
                val packageInfo = packages.find { it.packageName == data.packageName }
                    ?: throw IllegalStateException("Checking up-to-date status for package that has not been fetched")

                data.copy(isUpToDate = isInstallationUpToDate(packageInfo))
            }

            mainThread { installsState = InstallsState.Fetched(data = newInstallations.toUnsafeImmutable()) }
        } catch (t: Throwable) {
            Log.e(BuildConfig.TAG, "Failed to check installations up-to-date", t)
            mainThread { installsState = InstallsState.Error }
        }
    }

    private suspend fun fetchRemoteData() {
        listOf(
            screenModelScope.launch(Dispatchers.IO) {
                github.getBuildData().fold(
                    success = { remoteDataJson = it },
                    fail = { Log.w(BuildConfig.TAG, "Failed to fetch remote build data", it) },
                )
            },
            screenModelScope.launch(Dispatchers.IO) {
                maven.getAliuhookVersion().fold(
                    success = { latestAliuhookVersion = it },
                    fail = { Log.w(BuildConfig.TAG, "Failed to fetch latest Aliuhook version", it) },
                )
            },
        ).joinAll()

        if (remoteDataJson == null || latestAliuhookVersion == null) {
            mainThread { application.showToast(R.string.home_network_fail) }
        }
    }

    /**
     * Obtains all installed packages on the device that are an Endcord installation.
     */
    private fun fetchEndcordPackages(): List<PackageInfo> {
        return application.packageManager
            .getInstalledPackages(PackageManager.GET_META_DATA)
            .filter {
                // Packages installed via the legacy Installer do not have the metadata marker
                val isEndcordPkg = it.packageName == "com.endcord"
                val hasEndcordMeta = it.applicationInfo?.metaData?.containsKey("isEndcord") == true
                isEndcordPkg || hasEndcordMeta
            }
    }

    /**
     * Attempts to determine whether the Endcord installation is up-to-date.
     * If `null` is returned, then the build data was not fetched, and as such
     * the status cannot be determined.
     */
    private fun isInstallationUpToDate(pkg: PackageInfo): Boolean? {
        // Assume up-to-date when remote data hasn't been fetched yet
        val remoteBuildData = remoteDataJson ?: return null
        val latestAliuhookVersion = latestAliuhookVersion ?: return null

        // `longVersionCode` is unnecessary since Discord doesn't use `versionCodeMajor`
        @Suppress("DEPRECATION")
        val versionCode = pkg.versionCode

        // Check if the base APK version is a mismatch
        if (remoteBuildData.discordVersionCode != versionCode) return false

        // Try to parse install metadata. If none present, install was made via legacy installer.
        val apkPath = pkg.applicationInfo?.publicSourceDir ?: return false
        val installMetadata = try {
            val metadataFile = ZipReader(apkPath).use { it.openEntry("endcord.json")?.read() }
                ?: return false

            json.decodeFromStream<InstallMetadata>(metadataFile.inputStream())
        } catch (t: Throwable) {
            // If it failed to parse, then it's outdated
            Log.d(BuildConfig.TAG, "Failed to parse Endcord InstallMetadata from package ${pkg.packageName}", t)
            return false
        }

        // TODO: indicate this is a custom installation in the UI
        // If this installation used custom components, then assume that updates aren't needed
        if (installMetadata.options.customInjector != null ||
            installMetadata.options.customPatches != null
        ) {
            return true
        }

        // Check that all the installation components are up-to-date
        return remoteBuildData.injectorVersion == installMetadata.injectorVersion
            && remoteBuildData.patchesVersion == installMetadata.patchesVersion
            && remoteBuildData.kotlinVersion == installMetadata.kotlinVersion
            && latestAliuhookVersion == installMetadata.aliuhookVersion
    }
}
