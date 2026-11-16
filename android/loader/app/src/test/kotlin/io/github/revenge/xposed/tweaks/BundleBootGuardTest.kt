package io.github.revenge.xposed.tweaks

import io.github.revenge.xposed.tweaks.plugins.repos.sha256Hex
import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BundleBootGuardTest {
    private val dir: File = Files.createTempDirectory("bundle-boot").toFile()
    private var clock = 1_000_000L
    private val guard = BundleBootGuard(dir) { clock }
    private val bundle = File(dir, "bundle.js")
    private val manifest = File(dir, "endcord-release.json")
    private val signature = File(dir, "endcord-release.sig")
    private val companions = listOf(manifest, signature)

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    /** What the updater does with a new bundle: keeps the old one aside, then writes the new one and its release */
    private fun install(code: String, release: String?) {
        guard.beforeReplacing(bundle, companions, code.toByteArray())
        bundle.writeText(code)
        if (release != null) {
            manifest.writeText(release)
            signature.writeText("sig of $release")
        } else {
            manifest.delete()
            signature.delete()
        }
    }

    @Test
    fun `a bundle that comes up is never rolled back`() {
        install("good", "release 1")
        repeat(10) {
            assertFalse(guard.beforeLoad(bundle, companions))
            guard.confirm(sha256Hex(bundle.readBytes()))
        }
        assertEquals("good", bundle.readText())
    }

    @Test
    fun `a new bundle that doesn't come up three times goes back to the one before`() {
        install("good", "release 1")
        assertFalse(guard.beforeLoad(bundle, companions))
        guard.confirm(sha256Hex("good".toByteArray()))

        install("bad", "release 2")
        repeat(BundleBootGuard.FAILED_LOADS_BEFORE_ROLLBACK) { assertFalse(guard.beforeLoad(bundle, companions), "load ${it + 1}") }
        assertTrue(guard.beforeLoad(bundle, companions))

        // The previous bundle comes back with its own signed release, so the signature check passes for it
        assertEquals("good", bundle.readText())
        assertEquals("release 1", manifest.readText())
        assertEquals("sig of release 1", signature.readText())
        // And the bad one isn't taken again for a day
        assertTrue(guard.isRejected("bad".toByteArray()))
        assertFalse(guard.isRejected("good".toByteArray()))
        clock += BundleBootGuard.REJECTED_FOR_MS
        assertFalse(guard.isRejected("bad".toByteArray()))
    }

    @Test
    fun `the bundle that came back counts as one that came up`() {
        install("good", "release 1")
        guard.beforeLoad(bundle, companions)
        guard.confirm(sha256Hex("good".toByteArray()))
        install("bad", "release 2")
        repeat(4) { guard.beforeLoad(bundle, companions) }
        assertEquals("good", bundle.readText())
        repeat(10) { assertFalse(guard.beforeLoad(bundle, companions)) }
        assertEquals("good", bundle.readText())
    }

    @Test
    fun `without a bundle that came up before, there's nothing to go back to`() {
        install("first", "release 1")
        repeat(10) { assertFalse(guard.beforeLoad(bundle, companions)) }
        assertEquals("first", bundle.readText())
    }

    @Test
    fun `a bundle that never came up isn't kept to go back to`() {
        install("first", "release 1")
        guard.beforeLoad(bundle, companions)
        // Not confirmed: replaced before it came up
        install("second", "release 2")
        repeat(10) { assertFalse(guard.beforeLoad(bundle, companions)) }
        assertEquals("second", bundle.readText())
    }

    @Test
    fun `an unsigned bundle comes back without a release, and the bad one's release goes`() {
        install("good", null)
        guard.beforeLoad(bundle, companions)
        guard.confirm(sha256Hex("good".toByteArray()))
        install("bad", "release 2")
        repeat(4) { guard.beforeLoad(bundle, companions) }
        assertEquals("good", bundle.readText())
        assertFalse(manifest.exists())
        assertFalse(signature.exists())
    }

    @Test
    fun `a confirm for another bundle changes nothing`() {
        install("good", "release 1")
        guard.beforeLoad(bundle, companions)
        guard.confirm(sha256Hex("good".toByteArray()))
        install("bad", "release 2")
        repeat(3) {
            guard.beforeLoad(bundle, companions)
            // The old bundle's JavaScript, still running when the new one was downloaded, confirms itself
            guard.confirm(sha256Hex("good".toByteArray()))
        }
        assertTrue(guard.beforeLoad(bundle, companions))
    }

    @Test
    fun `a damaged state file reads as a fresh start`() {
        install("good", "release 1")
        File(dir, "bundle-boot.json").writeText("{not json")
        assertEquals(BundleBootGuard.State(), guard.state())
        assertFalse(guard.beforeLoad(bundle, companions))
        assertEquals(1, guard.state().loads)
    }
}
