/*
 * This file is part of Endcord, an Android Discord client mod based on Aliucord.
 * Licensed under the Open Software License version 3.0
 */

package com.aliucord.updater

import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Build
import com.aliucord.*
import com.aliucord.api.NotificationsAPI
import com.aliucord.entities.NotificationData
import com.aliucord.fragments.ConfirmDialog
import com.aliucord.i18n.I18n
import com.aliucord.screens.UpdaterScreen
import com.aliucord.settings.*
import com.aliucord.utils.*
import dalvik.system.BaseDexClassLoader
import java.io.File

/**
 * Handles checking for core/base updates and updating the Endcord core itself.
 * Builds are published to the `builds` branch of the Endcord mobile GitHub repository.
 */
internal object CoreUpdater {
    private val logger = Logger("Updater/Core")

    /** Name of the core bundle, both on GitHub and in the app's code cache where the injector loads it from. */
    const val CORE_FILE_NAME = "Endcord.zip"

    private val UPDATER_DATA_URL = "${Constants.ENDCORD_BUILDS_URL}/data.json"
    private val CORE_ZIP_URL = "${Constants.ENDCORD_BUILDS_URL}/$CORE_FILE_NAME"

    /** Settings key holding the core version that ran last, used to announce completed updates. */
    private const val LAST_VERSION_KEY = "EC_last_core_version"

    /** The latest version the user was told about in this process, so periodic checks don't repeat themselves. */
    @Volatile
    private var notifiedVersion: SemVer? = null

    /** A newer core that was downloaded already and only needs a restart. */
    @Volatile
    private var downloadedVersion: SemVer? = null

    @Volatile
    private var updating = false

    /** Time of the last completed check, in [System.currentTimeMillis]. */
    @Volatile
    @JvmStatic
    var lastCheck = 0L
        private set

    /** The remote build data. raw.githubusercontent.com caches for minutes, the query string keeps it fresh. */
    private fun fetchBuildData(): BuildData {
        val bust = System.currentTimeMillis() / 60_000
        return Http.simpleJsonGet("$UPDATER_DATA_URL?t=$bust", BuildData::class.java)
    }

    /**
     * Checks for base & core updates, and updates the core if possible.
     *
     * @param silent Whether this is a background check. Background checks don't report network errors and only
     * notify about a given version once.
     */
    @JvmStatic
    @JvmOverloads
    fun checkForUpdates(silent: Boolean = false) {
        if (isUpdaterDisabled() || isCustomCoreLoaded() || updating) return

        try {
            logger.debug("Checking for Endcord updates...")
            val data = fetchBuildData()
            lastCheck = System.currentTimeMillis()

            if (data.coreVersion <= SemVer.parse(BuildConfig.VERSION)) {
                logger.debug("No updates found!")
                return
            }
            if (silent && (notifiedVersion == data.coreVersion || downloadedVersion == data.coreVersion)) return
            notifiedVersion = data.coreVersion

            if (!isCompatible(data)) {
                NotificationsAPI.display(
                    NotificationData()
                        .setTitle(I18n.t("Endcord update available"))
                        .setBody(I18n.t("This update needs a fresh install. Tap to reinstall Endcord with Endcord Installer."))
                        .setAutoDismissPeriodSecs(15)
                        .setOnClick { reinstallEndcord() }
                )
            } else if (isAutoUpdateEnabled()) {
                downloadUpdate(data.coreVersion, restartWhenDone = false)
            } else {
                NotificationsAPI.display(
                    NotificationData()
                        .setTitle(I18n.t("Endcord updated"))
                        .setBody(buildBody(I18n.t("Version {version} is available. Tap to update now.", "version" to data.coreVersion), data))
                        .setAutoDismissPeriodSecs(30)
                        .setOnClick { downloadUpdate(data.coreVersion, restartWhenDone = true) }
                )
            }
        } catch (e: Exception) {
            if (silent) logger.warn("Background update check failed: ${e.message}")
            else logger.errorToast(I18n.t("Failed to check updates for Endcord"), e)
        }
    }

    /** What the updater screen shows about the core. */
    data class CoreStatus(
        val latest: SemVer,
        val current: SemVer,
        /** Whether the latest core can be loaded by this installation, or needs a reinstall with Endcord Installer. */
        val compatible: Boolean,
        val changelog: String?,
    ) {
        val updateAvailable: Boolean get() = latest > current
    }

    /** Fetches the state of the latest core for the updater screen. Network call, don't run on the main thread. */
    @JvmStatic
    fun fetchCoreStatus(): CoreStatus {
        val data = fetchBuildData()
        lastCheck = System.currentTimeMillis()
        return CoreStatus(
            latest = data.coreVersion,
            current = SemVer.parse(BuildConfig.VERSION),
            compatible = isCompatible(data),
            changelog = data.changelog,
        )
    }

    /** Updates the core to [version] right away and restarts, or opens Endcord Installer if a reinstall is needed. */
    @JvmStatic
    fun updateNow(status: CoreStatus) {
        if (status.compatible) downloadUpdate(status.latest, restartWhenDone = true)
        else reinstallEndcord()
    }

    private fun isCompatible(data: BuildData) = Constants.DISCORD_VERSION >= data.discordVersion
        && ManagerBuild.hasKotlin(data.kotlinVersion.toString())
        && ManagerBuild.hasInjector(data.injectorVersion.toString())
        && ManagerBuild.hasPatches(data.patchesVersion.toString())

    private fun buildBody(text: String, data: BuildData): CharSequence {
        val changelog = data.changelog?.trim()?.takeIf { it.isNotEmpty() } ?: return text
        return MDUtils.render("$text\n\n${changelog.take(300)}")
    }

    /**
     * Downloads the latest core next to the one the injector loads, then swaps it in.
     * The download goes to a temporary file first so an interrupted download never leaves a broken core behind.
     */
    private fun downloadUpdate(version: SemVer, restartWhenDone: Boolean) {
        if (updating) return
        updating = true
        if (restartWhenDone) Utils.showToast(I18n.t("Updating Endcord..."))

        Utils.threadPool.execute {
            try {
                val target = Utils.appContext.codeCacheDir.resolve(CORE_FILE_NAME)
                val tmp = File(target.parentFile, "$CORE_FILE_NAME.download")
                logger.debug("Downloading new core bundle from $CORE_ZIP_URL...")
                Http.simpleDownload(CORE_ZIP_URL, tmp)
                if (tmp.length() == 0L) throw IllegalStateException("Downloaded core is empty")
                if (!tmp.renameTo(target)) {
                    tmp.copyTo(target, overwrite = true)
                    tmp.delete()
                }
                downloadedVersion = version
                logger.debug("Finished downloading core $version")

                if (restartWhenDone) {
                    Utils.mainThread.post { Utils.restartAliucord(Utils.appActivity) }
                } else {
                    NotificationsAPI.display(
                        NotificationData()
                            .setTitle(I18n.t("Endcord updated"))
                            .setBody(I18n.t("Version {version} is ready. Tap to restart and apply it.", "version" to version))
                            .setAutoDismissPeriodSecs(30)
                            .setOnClick { Utils.restartAliucord(Utils.appActivity) }
                    )
                }
            } catch (e: Exception) {
                logger.errorToast(I18n.t("Failed to update Endcord!"), e)
            } finally {
                updating = false
            }
        }
    }

    /**
     * Tells the user once after the core was updated, so a silent background update doesn't go unnoticed.
     */
    @JvmStatic
    fun announceCompletedUpdate() {
        val current = BuildConfig.VERSION
        val last = Main.settings.getString(LAST_VERSION_KEY, null)
        if (last == current) return
        Main.settings.setString(LAST_VERSION_KEY, current)
        if (last == null) return // fresh install

        NotificationsAPI.display(
            NotificationData()
                .setTitle(I18n.t("Endcord updated"))
                .setBody(I18n.t("Endcord was updated to version {version}.", "version" to current))
                .setAutoDismissPeriodSecs(10)
                .setOnClick { Utils.openPage(Utils.appActivity, UpdaterScreen::class.java) }
        )
    }

    /**
     * Launches Endcord Installer to perform an update installation.
     * If the installer is not installed, prompt to download it.
     */
    private fun reinstallEndcord() {
        val intent = Intent(INSTALLER_PACKAGE + ".REINSTALL")
            .setClassName(INSTALLER_PACKAGE, "$INSTALLER_PACKAGE.MainActivity")
            .putExtra("aliucord.packageName", Utils.appContext.packageName)

        try {
            Utils.appActivity.startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            ConfirmDialog()
                .setTitle(I18n.t("Updater"))
                .setDescription(I18n.t("Endcord Installer is not installed on this device.") + "\n" +
                    I18n.t("Open the latest GitHub release to download it?"))
                .setOnOkListener { Utils.launchUrl(Constants.ENDCORD_INSTALLER_RELEASES) }
                .show(Utils.appActivity.supportFragmentManager, "No Installer")
        }
    }

    /** Package name of Endcord Installer. */
    const val INSTALLER_PACKAGE = "com.endcord.installer"

    /**
     * Determines whether the updater has been disabled by the user.
     * This includes ALL update checks, including plugins.
     */
    @JvmStatic
    fun isUpdaterDisabled(): Boolean = Main.settings.getBool(ALIUCORD_DISABLE_UPDATER, false)

    /**
     * Determines whether automatic core updates have been enabled by the user.
     */
    @JvmStatic
    fun isAutoUpdateEnabled(): Boolean = Main.settings.getBool(AUTO_UPDATE_ALIUCORD_KEY, false)

    /**
     * Determines whether custom core loading has been enabled by the user.
     * Note that this does not guarantee that a custom core is actually currently loaded,
     * refer to [isCustomCoreLoaded] for more information.
     */
    @JvmStatic
    fun isCustomCoreEnabled(): Boolean {
        return Main.settings.getBool(ALIUCORD_FROM_STORAGE_KEY, false)
    }

    /**
     * Determines whether the Endcord core is currently loaded from external storage.
     * This does not take into account the user-configurable toggle [ALIUCORD_FROM_STORAGE_KEY] itself.
     */
    @JvmStatic
    fun isCustomCoreLoaded(): Boolean = _customCoreLoaded

    // Check classloader paths to see if a custom core is loaded
    private val _customCoreLoaded: Boolean by lazy {
        try {
            val pathList = ReflectUtils.getField(
                BaseDexClassLoader::class.java,
                this.javaClass.classLoader,
                "pathList",
            )!!

            @Suppress("UNCHECKED_CAST")
            val dexElements = ReflectUtils.getField(
                pathList,
                "dexElements",
            )!! as Array<Any>

            val fieldName = when {
                Build.VERSION.SDK_INT < 23 -> "file"
                Build.VERSION.SDK_INT < 26 -> "zip"
                else -> "path"
            }

            dexElements.any { element ->
                val file = ReflectUtils.getField(element, fieldName) as File?
                file?.name == "Endcord.custom.zip"
            }
        } catch (e: Throwable) {
            logger.error("Failed to determine whether a custom core is loaded", e)
            false
        }
    }

    /**
     * The model of the data available at [UPDATER_DATA_URL].
     */
    private data class BuildData(
        @SerializedName("versionCode")
        var discordVersion: Int,
        var coreVersion: SemVer,
        var injectorVersion: SemVer,
        var patchesVersion: SemVer,
        var kotlinVersion: SemVer,
        /** Optional markdown release notes of the latest core. */
        var changelog: String? = null,
    )
}
