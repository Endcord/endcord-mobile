/*
 * This file is part of Aliucord, an Android Discord client mod.
 * Copyright (c) 2025 Juby210 & Vendicated
 * Licensed under the Open Software License version 3.0
 */

package com.aliucord

import android.content.Context
import android.content.res.AssetManager
import android.content.res.Resources
import com.aliucord.Utils.appContext
import com.aliucord.coreplugins.*
import com.aliucord.coreplugins.accountstanding.AccountStanding
import com.aliucord.coreplugins.badges.Badges
import com.aliucord.coreplugins.plugindownloader.PluginDownloader
import com.aliucord.coreplugins.rn.RNAPI
import com.aliucord.entities.CorePlugin
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.Plugin
import com.aliucord.i18n.I18n
import com.aliucord.patcher.Patcher
import com.aliucord.patcher.PreHook
import com.aliucord.settings.ALIUCORD_SAFE_MODE_KEY
import com.aliucord.utils.GsonUtils.fromJson
import com.aliucord.utils.GsonUtils.gson
import com.aliucord.utils.MapUtils
import com.aliucord.utils.ReflectUtils
import com.endcord.plugins.EndcordPlugins
import dalvik.system.PathClassLoader
import java.io.File
import java.io.InputStreamReader
import kotlin.system.measureTimeMillis

/** Endcord's Plugin Manager  */
object PluginManager {
    /** Map containing all loaded plugins  */
    @JvmField
    val plugins: MutableMap<String, Plugin> = LinkedHashMap()

    @JvmField
    val classLoaders: MutableMap<PathClassLoader, Plugin> = HashMap()

    @JvmField
    val logger = Logger("PluginManager")

    /** Plugins that failed to load for various reasons. Map of file to String or Exception  */
    @JvmField
    val failedToLoad: MutableMap<File, Any> = LinkedHashMap()

    /**
     * Loads a plugin
     *
     * @param context Context
     * @param file    Plugin file
     */
    @JvmStatic
    @Suppress("UNCHECKED_CAST")
    fun loadPlugin(context: Context, file: File) {
        val fileName = file.name.replace(".zip", "")
        logger.info("Loading plugin: $fileName")
        try {
            val loader = PathClassLoader(file.absolutePath, context.classLoader)
            val manifest = loader.getResourceAsStream("manifest.json").use { stream ->
                if (stream == null) {
                    failedToLoad[file] = "No manifest found"
                    logger.error("Failed to load plugin $fileName: No manifest found", null)
                    return
                }

                InputStreamReader(stream).use {
                    gson.fromJson(it, Plugin.Manifest::class.java)
                }
            }
            val name = requireNotNull(manifest.name)
            val pluginClass = loader.loadClass(manifest.pluginClassName) as Class<out Plugin>

            Patcher.addPatch(pluginClass.getDeclaredConstructor(), PreHook {
                try {
                    ReflectUtils.setField(Plugin::class.java, it.thisObject, "_manifest", manifest)
                } catch (e: Exception) {
                    logger.errorToast("Failed to set manifest for " + manifest.name, e)
                }
            })

            val pluginConstructor = try {
                pluginClass.getDeclaredConstructor()
            } catch (e: NoSuchMethodException) {
                logger.error("Plugin with name $name does not have a public constructor", e)
                return
            }
            val pluginInstance = try {
                pluginConstructor.newInstance()
            } catch (t: Exception) {
                logger.error("Failed to create plugin class for plugin with name $name", t)
                return
            }

            val existing = plugins[name]
            if (existing is EndcordPlugin) {
                // A plugin the user installed themselves wins over the built-in one of the same name
                logger.info("Plugin $name replaces the built-in plugin of the same name")
                if (isPluginEnabled(name)) existing.stop(context)
                existing.unload(context)
                plugins.remove(name)
            } else if (existing != null) {
                logger.error("Plugin with name $name already exists", null)
                return
            }

            pluginInstance.__filename = fileName

            if (loader.getResource("resources.arsc") != null) {
                // Based on https://stackoverflow.com/questions/7483568/dynamic-resource-loading-from-other-apk
                val assets = AssetManager::class.java
                    .getDeclaredConstructor()
                    .newInstance()

                AssetManager::class.java
                    .getMethod("addAssetPath", String::class.java)
                    .invoke(assets, file.absolutePath)

                @Suppress("DEPRECATION")
                pluginInstance.resources = Resources(
                    /* assets = */ assets,
                    /* metrics = */ context.resources.displayMetrics,
                    /* config = */ context.resources.configuration,
                )
            }

            plugins[name] = pluginInstance
            classLoaders[loader] = pluginInstance
            pluginInstance.load(context)
        } catch (e: Throwable) {
            failedToLoad[file] = e
            logger.error("Failed to load plugin $fileName:\n", e)
        }
    }

    /**
     * Unloads a plugin
     *
     * @param name Name of the plugin to unload
     */
    @JvmStatic
    fun unloadPlugin(name: String) {
        val plugin = plugins[name] ?: return
        logger.info("Unloading plugin: $name")

        require(plugin !is CorePlugin) { "Cannot unload coreplugin $name" }

        try {
            plugin.unload(appContext)
            plugins.remove(name)
        } catch (e: Throwable) {
            logger.error("Exception while unloading plugin: $name", e)
        }
    }

    /**
     * Enables a loaded plugin if it isn't already enabled
     *
     * @param name Name of the plugin to enable
     */
    @JvmStatic
    fun enablePlugin(name: String) {
        if (isPluginEnabled(name)) return
        Main.settings.setBool(getPluginPrefKey(name), true)
        try {
            startPlugin(name)
        } catch (e: Throwable) {
            logger.error("Exception while starting plugin: $name", e)
        }
    }

    /**
     * Disables a loaded plugin if it isn't already disables
     *
     * @param name Name of the plugin to disable
     */
    @JvmStatic
    fun disablePlugin(name: String) {
        if (!isPluginEnabled(name)) return
        Main.settings.setBool(getPluginPrefKey(name), false)
        try {
            stopPlugin(name)
        } catch (e: Throwable) {
            logger.error("Exception while stopping plugin: $name", e)
        }
    }

    /**
     * Toggles a plugin. If it is enabled, it will be disabled and vice versa.
     *
     * @param name Name of the plugin to toggle
     */
    @JvmStatic
    fun togglePlugin(name: String) {
        if (isPluginEnabled(name)) disablePlugin(name)
        else enablePlugin(name)
    }

    /**
     * Starts a plugin
     *
     * @param name Name of the plugin to start
     */
    @JvmStatic
    fun startPlugin(name: String) {
        logger.info("Starting plugin: $name")

        try {
            val millis = measureTimeMillis {
                plugins[name]!!.start(appContext)
            }
            logger.info("Started plugin: $name in $millis milliseconds")
        } catch (e: Throwable) {
            logger.error("Exception while starting plugin: $name", e)
        }
    }

    /**
     * Stops a plugin
     *
     * @param name Name of the plugin to stop
     */
    @JvmStatic
    fun stopPlugin(name: String) {
        logger.info("Stopping plugin: $name")
        try {
            plugins[name].let { p ->
                require(!(p is CorePlugin && p.isRequired)) { "Cannot stop required coreplugin $name" }
                p!!.stop(appContext)
            }
        } catch (e: Throwable) {
            logger.error("Exception while stopping plugin $name", e)
        }
    }

    /**
     * Remounts the plugin (stop -> unload -> load -> start)
     *
     * @param name Name of the plugin to remount
     */
    @JvmStatic
    fun remountPlugin(name: String) {
        require(name in plugins) { "No such plugin: $name" }
        require(isPluginEnabled(name)) { "Plugin not enabled: $name" }
        stopPlugin(name)
        unloadPlugin(name)
        loadPlugin(appContext, File(Constants.PLUGINS_PATH, "$name.zip"))
        startPlugin(name)
    }

    /**
     * Gets the preferences key for a plugin. This is used as key for plugin settings.
     * Format: AC_PM_{PLUGIN_NAME}
     *
     * @param name Name of the plugin
     */
    @JvmStatic
    fun getPluginPrefKey(name: String) = "AC_PM_$name"

    /**
     * Checks whether a plugin is enabled
     *
     * @param name Name of the plugin
     * @return Whether the plugin is enabled
     */
    @JvmStatic
    fun isPluginEnabled(name: String): Boolean {
        val plugin = plugins[name]
        if (plugin is CorePlugin && plugin.isRequired) return true

        return Main.settings.getBool(getPluginPrefKey(name), (plugin as? EndcordPlugin)?.enabledByDefault ?: true)
    }

    /**
     * Checks whether a plugin is enabled
     *
     * @param plugin Plugin
     * @return Whether the plugin is enabled
     */
    @JvmStatic
    @Suppress("unused")
    fun isPluginEnabled(plugin: Plugin) = isPluginEnabled(MapUtils.getMapKey(plugins, plugin)!!)

    /** Gets only plugins that should be visible to user */
    @JvmStatic
    fun getVisiblePlugins() = plugins.filter { (_, p) -> p !is CorePlugin || !p.isHidden }

    /** Checks whether safe mode is enabled. */
    @JvmStatic
    fun isSafeModeEnabled() = Main.settings.getBool(ALIUCORD_SAFE_MODE_KEY, false)

    /** Gets a formatted string with info about installed and enabled plugins */
    @JvmStatic
    fun getPluginsInfo(): String {
        val counts = getPluginCounts()
        return I18n.t("Total Plugins:") + " " + counts.total + "  |  " + I18n.t("Enabled Plugins:") + " " + counts.enabled
    }

    /** Plugin totals as shown at the top of the plugins page. Hidden coreplugins are not counted. */
    data class PluginCounts(val total: Int, val enabled: Int, val builtIn: Int, val external: Int)

    @JvmStatic
    fun getPluginCounts(): PluginCounts {
        val visible = getVisiblePlugins()
        val builtIn = visible.count { (_, p) -> p is CorePlugin }
        return PluginCounts(
            total = visible.size,
            enabled = visible.keys.count { isPluginEnabled(it) },
            builtIn = builtIn,
            external = visible.size - builtIn,
        )
    }

    @JvmStatic
    fun loadCorePlugins(context: Context) {
        val corePlugins = arrayOf(
            CoreFixes(),
            CoreFeatures(),
            AccountStanding(),
            Badges(),
            ButtonsAPI(),
            CommandHandler(),
            CoreCommands(),
            Decorations(),
            DefaultStickers(),
            ExperimentDefaults(),
            ForwardedMessages(),
            NewMessages(),
            NewPins(),
            NoTrack(),
            PluginDownloader(),
            Polls(),
            Pronouns(),
            RNAPI(),
            RemoveBilling(),
            RestartButton(),
            ShowReplyMentionFix(),
            SupportWarn(),
            TokenLogin(),
            UploadSize(),
        )

        val safeMode = isSafeModeEnabled()
        corePlugins.filter { p ->
            !safeMode || p.isRequired
        }.forEach { p ->
            logger.info("Loading coreplugin: ${p.name}")
            try {
                plugins[p.name] = p
                p.load(context)
            } catch (e: Throwable) {
                logger.errorToast("Failed to load coreplugin ${p.name}", e)
            }
        }

        // Built-in Endcord plugins are optional, so safe mode skips all of them
        if (safeMode) return
        val endcordPlugins = try {
            EndcordPlugins.create()
        } catch (e: Throwable) {
            logger.errorToast("Failed to create Endcord plugins", e)
            return
        }
        for (p in endcordPlugins) {
            if (plugins.containsKey(p.name)) {
                logger.warn("Skipping built-in plugin ${p.name}: a plugin with the same name is already loaded")
                continue
            }
            try {
                plugins[p.name] = p
                p.load(context)
            } catch (e: Throwable) {
                plugins.remove(p.name)
                logger.error("Failed to load built-in plugin ${p.name}", e)
            }
        }
    }

    @JvmStatic
    fun startCorePlugins() {
        for (p in plugins.values) {
            if (p !is CorePlugin) continue
            if (!isPluginEnabled(p.name)) continue
            startPlugin(p.name)
        }
    }
}
