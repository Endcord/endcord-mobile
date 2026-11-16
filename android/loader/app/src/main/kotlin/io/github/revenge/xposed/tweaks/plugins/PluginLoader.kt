package io.github.revenge.xposed.tweaks.plugins

import io.github.revenge.xposed.isDebuggable
import io.github.revenge.xposed.tweak
import io.github.revenge.xposed.tweaks.plugins.external.MANIFEST_FILE
import io.github.revenge.xposed.tweaks.plugins.external.discoverExternalPlugins
import io.github.revenge.xposed.tweaks.plugins.internal.*
import io.github.revenge.xposed.tweaks.plugins.repos.SourcesStore
import java.io.File

val pluginLoader by tweak {
    val errors = mutableListOf<String>()
    // Before anything is discovered, and before any JS can reach the bridge
    InstalledPluginPolicy.allowed = appInfo.isDebuggable

    // Load states before anything reads or writes a slot.
    PluginStatesStore.ensureLoaded(appInfo.dataDir)

    // Register default provenances.
    val sources = SourcesStore.ensureLoaded(appInfo.dataDir).toMutableMap()
    for ((id, source) in defaultSourcesToSeed(allInternalPlugins, sources)) {
        runCatching { SourcesStore.set(id, source) }
            .onSuccess { sources[id] = source }
            .onFailure { pluginLog.e("Failed to record stub source for $id", it) }
    }

    // Installed copies of internals with provenance win, and load as external plugins.
    val distRoot = externalPluginsRoot(appInfo.dataDir)
    // Installed plugins run only in a developer's own build (InstalledPluginPolicy): elsewhere nothing in their folder
    // is read, and no installed copy takes a built-in plugin's place
    val installedAllowed = InstalledPluginPolicy.allowed
    if (!installedAllowed && distRoot.listFiles()?.isNotEmpty() == true) {
        pluginLog.w("Not loading the plugins installed into the app: they only run in a developer's own build of it")
    }
    val shadowed = if (!installedAllowed) emptySet() else shadowedInternalIds(allInternalPlugins, sources) { id ->
        File(File(distRoot, id), MANIFEST_FILE).isFile
    }.toSet()
    for (id in shadowed) pluginLog.i("Using installed copy of internal plugin: $id")

    val known = allInternalPlugins.filterNot { it.manifest.id in shadowed }

    val discovery = if (installedAllowed) {
        discoverExternalPlugins(appInfo.dataDir, known.associate { it.manifest.id to it.manifest })
    } else {
        null
    }
    val external = discovery?.factories.orEmpty()

    val failures = discovery?.failures.orEmpty()
    pluginRegistry.recordDiscoveryFailures(failures)

    // Some discovery errors aren't hard errors (unsatisfied deps), but won't allow the plugins to run in this session.
    // They can run once the issues are resolved (e.g. loader/plugin/Discord update).
    for ((id, failure) in failures) {
        // Prefer the validated manifest's ID, since [id] could be a directory name instead.
        if (failure.isPluginFault) clearBootSlotFlags(failure.manifest?.id ?: id)
    }

    for (factory in known + external) pluginRegistry.add(factory)

    PluginStatesStore.batchSave {
        val slot = PluginStatesStore.boot

        for (factory in known + external) {
            val manifest = factory.manifest

            try {
                val essential = InternalPluginFlags.ESSENTIAL in factory.internalFlags
                val enabledByDefault = InternalPluginFlags.ENABLED_BY_DEFAULT in factory.internalFlags

                val shouldLoad = slot.isPluginEnabled(manifest.id) ||
                        essential ||
                        (enabledByDefault && !slot.hasPlugin(manifest.id))

                if (!shouldLoad) {
                    pluginLog.i("Skipping disabled plugin: ${manifest.id}")
                    continue
                }
                loadPlugin(factory)
            } catch (e: Throwable) {
                val err = "Failed to load plugin ${manifest.id}: ${e.message}"
                errors += err
                pluginRegistry.bootErrors[manifest.id] = e.toPluginError(PluginErrorCodes.LOAD_FAILED)
                pluginLog.e(err, e)
            }
        }
    }

    pluginLog.i("Loaded ${pluginRegistry.loaded.size} plugins with ${errors.size} errors")
    for (err in errors) pluginLog.e(err)
}
