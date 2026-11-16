package io.github.revenge.xposed.tweaks.bridge

import io.github.revenge.bridge.asDelegate
import io.github.revenge.reloadApp
import io.github.revenge.xposed.api.registerNativeMethod
import io.github.revenge.xposed.openFileGuarded
import io.github.revenge.xposed.RevengeConstants
import io.github.revenge.xposed.tweak
import io.github.revenge.xposed.tweaks.PreloadStatus
import io.github.revenge.xposed.tweaks.RevengeUpdater
import java.io.File

/**
 * `revenge.fs.*` + `revenge.app.*` bridge methods.
 */
val additionalBridgeMethods by tweak {
    registerNativeMethod("revenge.app.reload") {
        reloadApp()
    }

    // Endcord's boot guard (core/debug/bootGuard.ts): Discord came up with this bundle
    registerNativeMethod("endcord.bundle.confirm") {
        RevengeUpdater.confirmLoadedBundle()
        null
    }

    // What the loader checked about the bundle that runs, for Endcord's security page: only what it really checked
    registerNativeMethod("endcord.security.status") {
        mapOf(
            "loader" to RevengeConstants.LOADER_NAME,
            "loaderVersion" to RevengeConstants.LOADER_VERSION,
            // What really runs: the published bundle's kind while a custom link waits to be allowed
            "bundle" to RevengeUpdater.loadedBundleKind(),
            "requireSigned" to io.github.revenge.xposed.BuildConfig.REQUIRE_SIGNED,
            "acceptedSequence" to RevengeUpdater.acceptedSequence(),
            // Whether an update that doesn't come up is replaced by the one before it: on, except for the user's own link
            "rollback" to RevengeUpdater.rollbackGuardsUpdates(),
            "rolledBack" to RevengeUpdater.rolledBack,
            // Files of the preloads folder that ran in this start, and those refused (not Endcord's own)
            "preloadsRun" to PreloadStatus.ran,
            "preloadsRefused" to PreloadStatus.refused,
            // A custom bundle link is set but hasn't been allowed in this process
            "customUrlWaiting" to RevengeUpdater.customUrlWaiting(),
        )
    }

    withAppContext { ctx ->
        // Only the app's files and cache folders, and nothing the loader trusts written or deleted (BridgeFsPolicy.kt)
        val policy = BridgeFsPolicy(
            roots = listOf(ctx.filesDir, ctx.cacheDir),
            protectedPaths = RevengeUpdater.protectedPaths(ctx.dataDir.absolutePath) + File(ctx.cacheDir, LSPATCH_CACHE_DIR),
        )

        registerNativeMethod("revenge.fs.getConstants") {
            mapOf(
                "data" to ctx.dataDir.absolutePath,
                "files" to ctx.filesDir.absolutePath,
                "cache" to ctx.cacheDir.absolutePath,
            )
        }

        registerNativeMethod("revenge.fs.delete") { args ->
            val argv = args.asDelegate()
            val path by argv.string()
            val f = policy.check(path, BridgeFsAccess.WRITE)
            if (f.isDirectory) f.deleteRecursively() else f.delete()
        }

        registerNativeMethod("revenge.fs.exists") { args ->
            val argv = args.asDelegate()
            val path by argv.string()
            policy.check(path, BridgeFsAccess.READ).exists()
        }

        registerNativeMethod("revenge.fs.read") { args ->
            val argv = args.asDelegate()
            val path by argv.string()
            val file = policy.check(path, BridgeFsAccess.READ).also { it.openFileGuarded() }
            file.bufferedReader().use { it.readText() }
        }

        registerNativeMethod("revenge.fs.write") { args ->
            val argv = args.asDelegate()
            val path by argv.string()
            val contents by argv.string()
            policy.check(path, BridgeFsAccess.WRITE).apply {
                if (isDirectory) throw Error("Path is a directory: $path")
                parentFile?.mkdirs()
                writeText(contents)
            }

            null
        }
    }
}
