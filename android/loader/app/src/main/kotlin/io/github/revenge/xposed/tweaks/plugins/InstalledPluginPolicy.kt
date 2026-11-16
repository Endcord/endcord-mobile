package io.github.revenge.xposed.tweaks.plugins

import io.github.revenge.xposed.runsOnAndroid

/**
 * Plugins installed into the app (DEX code from a plugin repository or a file), as opposed to the ones built into the
 * loader. Once enabled, one runs as native code inside Discord at every start: before the signed bundle, through safe
 * mode, and after the JS plugin that installed it is gone. Any JS can ask for one through the bridge, and its files can
 * be put in place with Discord's own file module, which the bridge's file policy doesn't cover; Endcord's bundle never
 * installs one and has no screen for them. So, like preloads (Preloads.kt), they're a developer's tool: installed and
 * run only in a developer's own build of the app ([io.github.revenge.xposed.isDebuggable]).
 */
internal object InstalledPluginPolicy {
    /** Set from the app at start ([pluginLoader]); the JVM unit tests, which have no app, run as a developer's build */
    @Volatile
    var allowed: Boolean = !runsOnAndroid

    /** Throws for what only a developer's own build of the app may do */
    fun require(what: String) {
        if (!allowed) {
            throw PluginSystemError(
                PluginErrorCodes.NOT_ALLOWED,
                "$what: plugins installed into the app only run in a developer's own build of it",
            )
        }
    }
}
