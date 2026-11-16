package io.github.revenge.xposed.tweaks

import io.github.revenge.xposed.RevengeJson
import io.github.revenge.xposed.tweaks.plugins.repos.sha256Hex
import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The cache folder the boot guard keeps its files in can be written by Discord's own file module, so by any plugin: only
 * the bundle the guard itself kept to go back to, noted where the cache can't reach, is ever put back.
 */
class BootGuardTrustTest {
    private val dir: File = Files.createTempDirectory("bundle-boot-trust").toFile()
    private var clock = 1_000_000L
    private var noted: String? = null
    private val trusted = object : BundleBootGuard.TrustedPrevious {
        override fun get() = noted
        override fun set(hash: String) {
            noted = hash
        }
    }
    private val guard = BundleBootGuard(dir, trusted) { clock }
    private val bundle = File(dir, "bundle.js")
    private val manifest = File(dir, "endcord-release.json")
    private val signature = File(dir, "endcord-release.sig")
    private val companions = listOf(manifest, signature)

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    private fun install(code: String, release: String) {
        guard.beforeReplacing(bundle, companions, code.toByteArray())
        bundle.writeText(code)
        manifest.writeText(release)
        signature.writeText("sig of $release")
    }

    @Test
    fun `the bundle the guard kept is put back, and noted when it's kept`() {
        install("good", "release 1")
        guard.beforeLoad(bundle, companions)
        guard.confirm(sha256Hex("good".toByteArray()))
        install("bad", "release 2")
        assertEquals(sha256Hex("good".toByteArray()), noted)

        repeat(BundleBootGuard.FAILED_LOADS_BEFORE_ROLLBACK) { assertFalse(guard.beforeLoad(bundle, companions)) }
        assertTrue(guard.beforeLoad(bundle, companions))
        assertEquals("good", bundle.readText())
    }

    @Test
    fun `an older release put in previous by a plugin, with a state that sends the start back, isn't`() {
        install("current", "release 9")
        guard.beforeLoad(bundle, companions)
        guard.confirm(sha256Hex("current".toByteArray()))

        // What a plugin writes with Discord's file module: an old signed release to go back to, and a state saying the
        // current bundle failed three times
        val previous = File(dir, "previous").apply { mkdirs() }
        File(previous, "bundle.js").writeText("old")
        File(previous, "endcord-release.json").writeText("release 1")
        File(previous, "endcord-release.sig").writeText("sig of release 1")
        File(dir, "bundle-boot.json").writeText(
            RevengeJson.encodeToString(BundleBootGuard.State.serializer(), BundleBootGuard.State(bundle = sha256Hex("current".toByteArray()), loads = 3))
        )

        repeat(5) { assertFalse(guard.beforeLoad(bundle, companions)) }
        assertEquals("current", bundle.readText())
        assertEquals("release 9", manifest.readText())
        assertFalse(guard.isRejected("current".toByteArray()))
    }

    @Test
    fun `nothing noted yet (a loader before this one kept previous) means no going back`() {
        install("good", "release 1")
        guard.beforeLoad(bundle, companions)
        guard.confirm(sha256Hex("good".toByteArray()))
        install("bad", "release 2")
        noted = null
        repeat(6) { assertFalse(guard.beforeLoad(bundle, companions)) }
        assertEquals("bad", bundle.readText())
    }

    @Test
    fun `a bundle kept aside while it ran is noted once it comes up`() {
        install("first", "release 1")
        guard.beforeLoad(bundle, companions)
        // Running, not yet up, when a newer one is written over it
        guard.beforeReplacing(bundle, companions, "second".toByteArray(), running = sha256Hex("first".toByteArray()))
        bundle.writeText("second")
        assertEquals(null, noted)
        guard.confirm(sha256Hex("first".toByteArray()))
        assertEquals(sha256Hex("first".toByteArray()), noted)
    }
}
