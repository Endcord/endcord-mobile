package app.revenge.manager.ui.viewmodel.home

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.provider.Settings
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.cachedIn
import app.revenge.manager.BuildConfig
import app.revenge.manager.R
import app.revenge.manager.domain.manager.DownloadManager
import app.revenge.manager.domain.manager.DownloadResult
import app.revenge.manager.domain.manager.InstallManager
import app.revenge.manager.domain.manager.InstallMethod
import app.revenge.manager.domain.manager.PreferenceManager
import app.revenge.manager.domain.repository.RestRepository
import app.revenge.manager.installer.Installer
import app.revenge.manager.installer.session.SessionInstaller
import app.revenge.manager.installer.shizuku.ShizukuInstaller
import app.revenge.manager.installer.shizuku.ShizukuPermissions
import app.revenge.manager.network.dto.Release
import app.revenge.manager.network.utils.CommitsPagingSource
import app.revenge.manager.network.utils.dataOrNull
import app.revenge.manager.utils.DiscordVersion
import app.revenge.manager.utils.InstalledDiscord
import app.revenge.manager.utils.isMiui
import app.revenge.manager.utils.showToast
import cafe.adriel.voyager.core.model.ScreenModel
import cafe.adriel.voyager.core.model.screenModelScope
import kotlinx.coroutines.launch
import java.io.File

class HomeViewModel(
    private val repo: RestRepository,
    val context: Context,
    val prefs: PreferenceManager,
    val installManager: InstallManager,
    private val downloadManager: DownloadManager
) : ScreenModel {

    private val cacheDir = context.externalCacheDir ?: File(
        Environment.getExternalStorageDirectory(),
        Environment.DIRECTORY_DOWNLOADS
    ).resolve(BuildConfig.MANAGER_NAME).also { it.mkdirs() }

    var discordVersions by mutableStateOf<Map<DiscordVersion.Type, DiscordVersion?>?>(null)
        private set

    /** The version of the Discord installed on the phone, if it is */
    var installedDiscord by mutableStateOf(InstalledDiscord.version(context))
        private set

    var release by mutableStateOf<Release?>(null)
        private set

    private var updateDownloadUrl by mutableStateOf<String?>(null)
    var showUpdateDialog by mutableStateOf(false)
    var isUpdating by mutableStateOf(false)
    val commits = Pager(PagingConfig(pageSize = 30)) { CommitsPagingSource(repo) }.flow.cachedIn(
        screenModelScope
    )

    init {
        getDiscordVersions()
        checkForUpdate()
    }

    fun getDiscordVersions() {
        installedDiscord = InstalledDiscord.version(context)
        installManager.getInstalled()
        screenModelScope.launch {
            discordVersions = repo.getLatestDiscordVersions().dataOrNull
            if (prefs.autoClearCache) autoClearCache()
        }
    }

    fun launchMod() {
        installManager.current?.let {
            val intent = context.packageManager.getLaunchIntentForPackage(it.packageName)?.apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }
    }

    fun uninstallMod() {
        installManager.uninstall()
    }

    fun launchModInfo() {
        installManager.current?.let {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                data = Uri.parse("package:${it.packageName}")
                context.startActivity(this)
            }
        }
    }

    private fun autoClearCache() {
        val currentVersion =
            DiscordVersion.fromVersionCode(installManager.current?.versionCode.toString()) ?: return
        val latestVersion = when {
            prefs.discordVersion.isBlank() -> discordVersions?.get(prefs.channel)
            else -> DiscordVersion.fromVersionCode(prefs.discordVersion)
        } ?: return

        if (latestVersion > currentVersion) {
            for (file in (context.externalCacheDir ?: context.cacheDir).listFiles()
                ?: emptyArray()) {
                if (file.isDirectory) file.deleteRecursively()
            }
        }
    }

    private fun checkForUpdate() {
        screenModelScope.launch {
            // The repository also releases the classic client, so only tags of the Release Installer workflow count
            release = repo.getReleases(BuildConfig.REPO).dataOrNull?.firstOrNull { it.tagName.startsWith(RELEASE_TAG_PREFIX) }
            release?.let {
                updateDownloadUrl = it.assets.firstOrNull { asset -> asset.name.endsWith(".apk") }?.browserDownloadUrl
                showUpdateDialog = it.tagName.removePrefix(RELEASE_TAG_PREFIX) != BuildConfig.VERSION_NAME
            }
        }
    }

    fun downloadAndInstallUpdate(onProgressUpdate: (Float?) -> Unit) {
        screenModelScope.launch {
            isUpdating = true
            downloadAndInstall(updateDownloadUrl!!, "update.apk", onProgressUpdate)
            isUpdating = false
        }
    }

    // Endcord Classic --------------------------------------------------------------------------------------------------

    /** Whether Endcord Classic Installer is on the phone */
    var classicInstallerInstalled by mutableStateOf(isClassicInstallerInstalled())
        private set
    var isGettingClassic by mutableStateOf(false)
        private set
    var classicProgress by mutableStateOf<Float?>(null)
        private set

    private fun isClassicInstallerInstalled() =
        context.packageManager.getLaunchIntentForPackage(BuildConfig.CLASSIC_INSTALLER_PACKAGE) != null

    fun refreshClassic() {
        classicInstallerInstalled = isClassicInstallerInstalled()
    }

    /** Opens Endcord Classic Installer, or downloads and installs it first */
    fun openOrGetClassicInstaller() {
        refreshClassic()
        val intent = context.packageManager.getLaunchIntentForPackage(BuildConfig.CLASSIC_INSTALLER_PACKAGE)
        if (intent != null) {
            context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return
        }
        if (isGettingClassic) return
        screenModelScope.launch {
            isGettingClassic = true
            classicProgress = null
            downloadAndInstall(BuildConfig.CLASSIC_INSTALLER_URL, "classic-installer.apk") { classicProgress = it }
            isGettingClassic = false
            refreshClassic()
        }
    }

    /** Downloads an APK into the cache and installs it with the chosen install method */
    private suspend fun downloadAndInstall(url: String, fileName: String, onProgressUpdate: (Float?) -> Unit) {
        val apk = File(cacheDir, fileName)
        if (apk.exists()) apk.delete()
        val downloadResult = downloadManager.downloadUpdate(url, apk, onProgressUpdate)

        if (downloadResult !is DownloadResult.Success) {
            if (downloadResult is DownloadResult.Error) {
                Log.e("HomeViewModel", "Download failed: ${downloadResult.debugReason}")
                context.showToast(R.string.msg_download_failed)
            }
            return
        }

        val installMethod = if (prefs.installMethod == InstallMethod.SHIZUKU && !ShizukuPermissions.waitShizukuPermissions()) {
            // Temporarily use DEFAULT if SHIZUKU permissions are not granted
            context.showToast(R.string.msg_shizuku_denied)
            InstallMethod.DEFAULT
        } else {
            prefs.installMethod
        }

        val installer: Installer = when (installMethod) {
            InstallMethod.DEFAULT -> SessionInstaller(context)
            InstallMethod.SHIZUKU -> ShizukuInstaller(context)
        }

        installer.installApks(silent = !isMiui, apk)
    }

    private companion object {
        const val RELEASE_TAG_PREFIX = "next-installer-v"
    }
}
