/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins

import com.aliucord.Main
import com.aliucord.PluginManager
import com.aliucord.api.NotificationsAPI
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.NotificationData
import com.aliucord.i18n.I18n
import com.aliucord.Utils
import com.aliucord.settings.Plugins

/**
 * Tracks which built-in plugins the user has already seen, like Endcord PC's NewPluginsManager:
 * plugins added by an update are marked as new on the plugins page and announced once.
 */
object NewPlugins {
    private const val KNOWN_KEY = "EC_known_builtin_plugins"

    private var newNames: Set<String> = emptySet()

    /** Whether [name] is a built-in plugin that arrived with the latest update. */
    @JvmStatic
    fun isNew(name: String): Boolean = name in newNames

    /** Number of plugins currently marked as new. */
    @JvmStatic
    val count: Int
        get() = newNames.size

    /** Compares the built-in plugins with the ones seen before. Call once after plugins are loaded. */
    @JvmStatic
    fun refresh() {
        val builtIn = PluginManager.plugins.values.filterIsInstance<EndcordPlugin>().map { it.name }
        val stored = Main.settings.getJSONArray(KNOWN_KEY, null)
        val known = HashSet<String>()
        if (stored != null) for (i in 0 until stored.length()) known += stored.optString(i)

        // On the very first launch every plugin is "new", which isn't useful, so just remember them
        newNames = if (stored == null) emptySet() else builtIn.filterTo(LinkedHashSet()) { it !in known }
        Main.settings.setObject(KNOWN_KEY, (known + builtIn).sorted())

        if (newNames.isNotEmpty()) {
            val names = newNames.take(5).joinToString(", ")
            val more = if (newNames.size > 5) " " + I18n.t("and {count} more", "count" to newNames.size - 5) else ""
            NotificationsAPI.display(
                NotificationData()
                    .setTitle(I18n.t("New plugins"))
                    .setBody(I18n.t("{count} new plugins were added: {names}", "count" to newNames.size, "names" to names + more))
                    .setAutoDismissPeriodSecs(15)
                    .setOnClick { Utils.openPage(Utils.appActivity, Plugins::class.java) }
            )
        }
    }
}
