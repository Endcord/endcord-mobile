/*
 * This file is part of Endcord, an Android Discord client mod based on Aliucord.
 * Copyright (c) 2021 Juby210 & Vendicated
 * Licensed under the Open Software License version 3.0
 */

package com.aliucord.coreplugins.plugindownloader

import com.aliucord.*
import com.aliucord.entities.CorePlugin
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import java.io.File
import java.io.IOException

internal class PluginFile(val plugin: String) : File("${Constants.PLUGINS_PATH}/$plugin.zip") {
    val isInstalled
        get() = this.exists()

    fun install(author: String, repo: String, callback: Runnable? = null) {
        install("https://cdn.jsdelivr.net/gh/$author/$repo@builds/$plugin.zip", callback)
    }

    fun install(url: String, callback: Runnable? = null) {
        Utils.threadPool.execute {
            val safeMode = PluginManager.isSafeModeEnabled()
            val isReinstall = isInstalled
            // Built-in Endcord plugins may be replaced by a plugin the user installs, other coreplugins may not
            val existing = PluginManager.plugins[plugin]
            if (existing is CorePlugin && existing !is EndcordPlugin) {
                Utils.showToast(I18n.t("External plugins are not able to override built-in coreplugins!"))
                return@execute
            }

            try {
                Http.simpleDownload(url, this)
                // Plugins are started on the main thread.
                // Post to main thread here for consistency.
                // Otherwise, plugins that create Handler instances or similar will error
                Utils.mainThread.post {
                    // A built-in of the same name is replaced by loadPlugin itself
                    if (isReinstall && PluginManager.plugins[plugin] !is CorePlugin) {
                        PluginManager.stopPlugin(plugin)
                        PluginManager.unloadPlugin(plugin)
                    }
                    if (!safeMode) {
                        PluginManager.loadPlugin(Utils.appContext, this)
                        if (PluginManager.isPluginEnabled(plugin))
                            PluginManager.startPlugin(plugin)
                        else
                            PluginManager.enablePlugin(plugin)
                    }
                    Utils.showToast(I18n.t(if (isReinstall) "Plugin {plugin} successfully reinstalled!" else "Plugin {plugin} successfully installed!", "plugin" to plugin))
                    if (safeMode) {
                        Utils.showToast(I18n.t("Plugin not loaded due to safe mode!"))
                    }
                    if (PluginManager.plugins[plugin]?.requiresRestart() == true)
                        Utils.promptRestart()

                    callback?.let { Utils.mainThread.post(it) }
                }
            } catch (ex: IOException) {
                Logger("PluginFile").error(ex)
                Utils.showToast(I18n.t("Failed to download {plugin}: {error}", "plugin" to plugin, "error" to ex.message))
                if (this.exists()) this.delete()
            }
        }
    }

    fun uninstall(callback: Runnable? = null) {
        val success = this.delete()
        Utils.showToast(I18n.t(if (success) "Successfully uninstalled {plugin}" else "Failed to uninstall {plugin}", "plugin" to plugin))
        if (success) {
            val p = PluginManager.plugins[plugin]
            if (p !is CorePlugin) {
                PluginManager.stopPlugin(plugin)
                PluginManager.unloadPlugin(plugin)
            }

            if (p?.requiresRestart() == true)
                Utils.promptRestart()

            callback?.let { Utils.mainThread.post(it) }
        }
    }
}
