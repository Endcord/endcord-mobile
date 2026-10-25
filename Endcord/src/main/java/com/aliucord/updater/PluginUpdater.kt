package com.aliucord.updater

import android.os.Build
import com.aliucord.*
import com.aliucord.Utils.openPage
import com.aliucord.api.NotificationsAPI
import com.aliucord.entities.*
import com.aliucord.i18n.I18n
import com.aliucord.screens.UpdaterScreen
import com.aliucord.settings.AUTO_UPDATE_PLUGINS_KEY
import com.aliucord.utils.MDUtils
import com.aliucord.utils.SemVer
import java.io.File

/**
 * Manages fetching and installing plugin updates.
 * This class is pure and does not store plugin updates globally.
 */
internal object PluginUpdater {
    private val logger = Logger("Updater/Plugins")
    private val NOTIFICATION_TITLE get() = I18n.t("Plugins Updater")

    /**
     * Represents an available plugin update.
     */
    data class PluginUpdate(
        /**
         * The currently loaded plugin this is update applies to.
         */
        val plugin: Plugin,
        /**
         * The plugin's manifest name/id
         */
        val pluginName: String = plugin.name,
        /**
         * The fetched update info for the latest build of this plugin.
         */
        val info: PluginUpdaterSource.PluginBuildInfo,
    ) {
        /**
         * Whether the base Discord/Aliucord installation is outdated and
         * requires a reinstallation update through Aliucord Manager.
         */
        val isBaseOutdated: Boolean = info.minimumDiscordVersion > Constants.DISCORD_VERSION ||
            !ManagerBuild.hasKotlin(info.minimumKotlinVersion.toString())

        /**
         * Whether the current Aliucord core is outdated and requires an update.
         */
        val isCoreOutdated: Boolean = (info.minimumAliucordVersion ?: SemVer.Zero) > SemVer.parse(BuildConfig.VERSION)

        /**
         * Whether the current Android version is too low to load the new plugin.
         */
        val isAndroidOutdated: Boolean = info.minimumApiLevel > Build.VERSION.SDK_INT

        /**
         * Whether this plugin should be allowed to update as
         * the new build will not cause issues upon loading.
         */
        fun isUpdatePossible(): Boolean =
            !isBaseOutdated && !isCoreOutdated && !isAndroidOutdated
    }

    /**
     * Determines whether automatic plugin updates have been enabled by the user.
     */
    @JvmStatic
    fun isAutoUpdateEnabled(): Boolean = Main.settings.getBool(AUTO_UPDATE_PLUGINS_KEY, false)

    /**
     * Force fetches all available updates, including ones that cannot be updated.
     * The resulting updates should not be held for long durations (ie, cached globally).
     */
    @JvmStatic
    fun fetchUpdates(source: PluginUpdaterSource): List<PluginUpdate> {
        logger.info("Checking for plugin updates...")

        val updates = mutableListOf<PluginUpdate>()
        for (plugin in PluginManager.plugins.values) {
            try {
                if (plugin is CorePlugin) continue

                val info = source.getPluginBuildInfo(
                    pluginName = plugin.manifest.name ?: continue,
                    updateInfoUrl = plugin.manifest.updateUrl
                        ?.takeIf { it.isNotEmpty() }
                        ?: continue,
                )
                // Previous attempt at retrieving updater data failed
                if (info == null) {
                    logger.warn("Failed to check updates for plugin ${plugin.name} (${plugin.__filename}.zip)")
                    continue
                }

                // Assume invalid local versions are always out of date
                val localVersion = SemVer.parseOrNull(plugin.manifest.version) ?: SemVer.Zero

                // Plugin is already up-to-date
                if (localVersion >= info.version)
                    continue

                updates += PluginUpdate(
                    plugin = plugin,
                    pluginName = plugin.name,
                    info = info,
                )
            } catch (e: Exception) {
                logger.error("Failed checking updates for plugin ${plugin.name} (${plugin.__filename}.zip)", e)
                continue
            }
        }
        return updates
    }

    @JvmStatic
    fun startupCheck() {
        val updates = fetchUpdates(PluginUpdaterSource())
        if (updates.isEmpty()) return

        // Only show update notification
        if (!isAutoUpdateEnabled()) {
            val notification = NotificationData()
                .setTitle(NOTIFICATION_TITLE)
                .setBody(MDUtils.render(buildString {
                    append(I18n.t("Found {count} available plugin updates:", "count" to updates.size)).append(' ')
                    append(updates
                        .take(5)
                        .joinToString(separator = ", ", transform = { "**${it.pluginName}**" }))

                    if (updates.size > 5)
                        append(' ').append(I18n.t("and {count} more", "count" to updates.size - 5))

                    append(". ").append(I18n.t("Tap to see more."))
                }))
                .setAutoDismissPeriodSecs(30)
                .setOnClick { openPage(Utils.appActivity, UpdaterScreen::class.java) }

            NotificationsAPI.display(notification)
            return
        }

        // Update plugins
        val (succeeded, failed) = updates
            .filter(PluginUpdate::isUpdatePossible)
            .partition(::updatePlugin)

        val notification = if (failed.isNotEmpty()) {
            NotificationData()
                .setTitle(NOTIFICATION_TITLE)
                .setAutoDismissPeriodSecs(30)
                .setBody(MDUtils.render(buildString {
                    append(I18n.t("Failed to update some plugins:")).append(' ')
                    append(failed
                        .take(5)
                        .joinToString(separator = ", ", transform = { "**${it.pluginName}**" }))
                    if (failed.size > 5)
                        append(' ').append(I18n.t("and {count} more", "count" to failed.size - 5))
                }))
                .setOnClick { openPage(Utils.appActivity, UpdaterScreen::class.java) }
        } else {
            NotificationData()
                .setTitle(NOTIFICATION_TITLE)
                .setAutoDismissPeriodSecs(10)
                .setOnClick { /* Do nothing */ }
                .setBody(MDUtils.render(buildString {
                    append(I18n.t("Automatically updated plugins:")).append(' ')
                    append(succeeded
                        .take(5)
                        .joinToString(separator = ", ", transform = { "**${it.pluginName}**" }))
                    if (succeeded.size > 5)
                        append(' ').append(I18n.t("and {count} more", "count" to succeeded.size - 5))
                }))
        }
        NotificationsAPI.display(notification)
    }

    @JvmStatic
    fun updatePlugin(update: PluginUpdate): Boolean {
        if (!update.isUpdatePossible())
            throw IllegalArgumentException("Cannot perform plugin update that is not possible")

        return try {
            // Legacy build url style, which contains %s as a placeholder for the plugin name (optional now)
            val downloadUrl = update.info.buildUrl.replace("%s", update.pluginName)

            Http.Request(downloadUrl).execute().use { resp ->
                // TODO: verify crc32
                resp.saveToFile(File(Constants.PLUGINS_PATH, "${update.plugin.__filename}.zip"))
            }

            reloadPlugin(update.plugin)
            true
        } catch (e: Exception) {
            logger.error("Failed to update plugin ${update.plugin} (${update.plugin.__filename}.zip)", e)
            false
        }
    }

    private val restartPrompt = Runnable {
        Utils.promptRestart(I18n.t("Plugin update requires a restart. Restart now?"))
    }

    /** Several plugins may update at once, only ask to restart a single time. */
    private fun promptRestartOnce() {
        Utils.mainThread.removeCallbacks(restartPrompt)
        Utils.mainThread.postDelayed(restartPrompt, 500)
    }

    private fun reloadPlugin(plugin: Plugin) {
        Utils.mainThread.post {
            if (PluginManager.isPluginEnabled(plugin.name)) {
                PluginManager.remountPlugin(plugin.name)
            } else {
                // Disabled plugins are loaded but not started, reload them so the new version shows up
                PluginManager.unloadPlugin(plugin.name)
                PluginManager.loadPlugin(Utils.appContext, File(Constants.PLUGINS_PATH, "${plugin.__filename}.zip"))
            }
            val newPlugin = PluginManager.plugins[plugin.name] ?: return@post

            if (plugin.requiresRestart() || newPlugin.requiresRestart()) promptRestartOnce()
        }
    }
}
