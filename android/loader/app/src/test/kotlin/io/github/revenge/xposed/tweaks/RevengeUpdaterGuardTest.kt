package io.github.revenge.xposed.tweaks

import io.github.revenge.xposed.RevengeConstants
import io.github.revenge.xposed.tweaks.plugins.repos.sha256Hex
import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The updater around the boot guard: which bundles it watches, and what it says about the one that runs */
class RevengeUpdaterGuardTest {
    private val dataDir: File = Files.createTempDirectory("updater").toFile()
    private val cacheDir = File(dataDir, RevengeConstants.CACHE_DIR).apply { mkdirs() }
    private val bundle = File(cacheDir, RevengeConstants.MAIN_SCRIPT_FILE)
    private val etag = File(cacheDir, "etag.txt")
    private val releaseFiles = listOf(File(cacheDir, "endcord-release.json"), File(cacheDir, "endcord-release.sig"))
    private val guard = BundleBootGuard(cacheDir)

    @AfterTest
    fun cleanUp() {
        dataDir.deleteRecursively()
    }

    private fun useCustomUrl() {
        File(dataDir, "${RevengeConstants.FILES_DIR}/loader.json").apply { parentFile!!.mkdirs() }
            .writeText("""{ "customLoadUrl": { "enabled": true, "url": "http://localhost:4040/endcord.js" } }""")
    }

    /** One start of the downloaded bundle, as revengeScriptLoader does it */
    private fun start() {
        RevengeUpdater.beforeBundleLoad()
        RevengeUpdater.noteLoaded("downloaded")
    }

    /** A published bundle that came up, kept to go back to, then [next] written over it */
    private fun publishedThen(next: String) {
        RevengeUpdater.init(dataDir.path)
        bundle.writeText("published")
        start()
        RevengeUpdater.confirmLoadedBundle()
        assertTrue(guard.state().cameUp)
        guard.beforeReplacing(bundle, releaseFiles, next.toByteArray())
        bundle.writeText(next)
    }

    @Test
    fun `a bundle from the user's own link is never counted or rolled back`() {
        publishedThen("upstream Revenge, which never confirms")
        useCustomUrl()
        RevengeUpdater.init(dataDir.path)

        repeat(10) {
            start()
            assertFalse(RevengeUpdater.rolledBack)
            assertEquals("custom", RevengeUpdater.loadedBundleKind())
            RevengeUpdater.confirmLoadedBundle()
        }
        assertEquals("upstream Revenge, which never confirms", bundle.readText())
        assertEquals(0, guard.state().loads)
        assertFalse(RevengeUpdater.rollbackGuardsUpdates())
    }

    @Test
    fun `the published bundle that comes back is reported as what it is, and its ETag goes`() {
        publishedThen("a bad update")
        etag.writeText("https://example/endcord.min.js\n\"bad\"")

        repeat(BundleBootGuard.FAILED_LOADS_BEFORE_ROLLBACK) {
            start()
            assertFalse(RevengeUpdater.rolledBack)
        }
        start()
        assertTrue(RevengeUpdater.rolledBack)
        assertEquals("published", bundle.readText())
        assertFalse(etag.exists())
        // No release files in this test: the published bundle that came back, let through unsigned in this build
        assertEquals("unsigned", RevengeUpdater.loadedBundleKind())
        assertTrue(RevengeUpdater.rollbackGuardsUpdates())
    }

    @Test
    fun `the built-in bundle confirms nothing`() {
        publishedThen("a bad update")
        RevengeUpdater.beforeBundleLoad()
        RevengeUpdater.noteLoaded("builtin")
        RevengeUpdater.confirmLoadedBundle()
        assertEquals("builtin", RevengeUpdater.loadedBundleKind())
        assertEquals(sha256Hex("a bad update".toByteArray()), guard.state().bundle)
        assertFalse(guard.state().cameUp)
    }
}
