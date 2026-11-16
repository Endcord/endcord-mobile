package io.github.revenge.xposed.tweaks

import io.github.revenge.xposed.tweaks.plugins.repos.sha256Hex
import java.io.File
import java.nio.file.Files
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The guard as the updater uses it: downloads through [BundleBootGuard.replace], and what runs in each start */
class BundleBootGuardReplaceTest {
    private val dir: File = Files.createTempDirectory("bundle-boot-replace").toFile()
    private var clock = 1_000_000L
    private val guard = BundleBootGuard(dir) { clock }
    private val bundle = File(dir, "bundle.js")
    private val manifest = File(dir, "endcord-release.json")
    private val signature = File(dir, "endcord-release.sig")
    private val etag = File(dir, "etag.txt")
    private val companions = listOf(manifest, signature)

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    private fun hash(code: String) = sha256Hex(code.toByteArray())

    /** A downloaded release, written as the updater writes it; [running] is the bundle running in this start */
    private fun download(code: String, release: String, running: String? = null): Boolean =
        guard.replace(bundle, companions, code.toByteArray(), running) {
            bundle.writeText(code)
            manifest.writeText(release)
            signature.writeText("sig of $release")
            etag.writeText("etag of $code")
        }

    /** A start: the guard, then what runs. Returns whether it rolled back */
    private fun start(): Boolean = guard.beforeLoad(bundle, companions, discardOnRollback = listOf(etag))

    private fun failedStartsUntilRollback(): Int {
        var starts = 0
        while (starts < 10) {
            starts++
            if (start()) return starts
        }
        return -1
    }

    @Test
    fun `a bundle that says it came up after a newer one was written is still the one to go back to`() {
        download("first", "release 1")
        start()
        // A newer release lands seconds into the first start of "first", before it says it came up
        assertTrue(download("second", "release 2", running = hash("first")))
        guard.confirm(hash("first"))

        // "second" never comes up: "first", with its own release, comes back
        assertEquals(BundleBootGuard.FAILED_LOADS_BEFORE_ROLLBACK + 1, failedStartsUntilRollback())
        assertEquals("first", bundle.readText())
        assertEquals("release 1", manifest.readText())
        assertEquals("sig of release 1", signature.readText())
        assertTrue(guard.isRejected("second".toByteArray()))
    }

    @Test
    fun `a bundle that ran but never said it came up isn't gone back to`() {
        download("old", "release 0")
        start()
        guard.confirm(hash("old"))
        download("first", "release 1", running = hash("old"))
        start()
        // "first" runs, a newer one lands, and "first" never comes up
        download("second", "release 2", running = hash("first"))

        // The one that came up before "first" comes back, not "first"
        assertEquals(BundleBootGuard.FAILED_LOADS_BEFORE_ROLLBACK + 1, failedStartsUntilRollback())
        assertEquals("old", bundle.readText())
        assertEquals("release 0", manifest.readText())
    }

    @Test
    fun `a confirm from an earlier start doesn't make the bundle kept aside one to go back to`() {
        download("first", "release 1")
        start()
        download("second", "release 2", running = hash("first"))
        // The next start runs "second"; a confirm of "first" can't come from it
        start()
        guard.confirm(hash("first"))
        repeat(10) { assertFalse(start()) }
        assertEquals("second", bundle.readText())
    }

    @Test
    fun `a rollback clears the ETag, so the next check downloads the release again`() {
        download("good", "release 1")
        start()
        guard.confirm(hash("good"))
        download("bad", "release 2")
        assertFalse(start())
        assertTrue(etag.exists(), "kept while nothing is rolled back")

        assertEquals(BundleBootGuard.FAILED_LOADS_BEFORE_ROLLBACK, failedStartsUntilRollback())
        assertFalse(etag.exists())
        // Refused for a day, written over nothing, and then taken again
        var wrote = false
        assertFalse(guard.replace(bundle, companions, "bad".toByteArray(), null) { wrote = true })
        assertFalse(wrote)
        assertEquals("good", bundle.readText())
        clock += BundleBootGuard.REJECTED_FOR_MS
        assertTrue(download("bad", "release 2", running = hash("good")))
        assertEquals("bad", bundle.readText())
    }

    @Test
    fun `a start waits for a download that is being written, and doesn't roll back over it`() {
        download("good", "release 1")
        start()
        guard.confirm(hash("good"))
        download("bad", "release 2")
        repeat(BundleBootGuard.FAILED_LOADS_BEFORE_ROLLBACK) { assertFalse(start()) }

        // The next start would roll back; a newer release is being written as it begins
        val writing = CountDownLatch(1)
        val finish = CountDownLatch(1)
        val downloader = thread {
            guard.replace(bundle, companions, "newer".toByteArray(), null) {
                writing.countDown()
                finish.await(5, TimeUnit.SECONDS)
                bundle.writeText("newer")
                manifest.writeText("release 3")
                signature.writeText("sig of release 3")
            }
        }
        assertTrue(writing.await(5, TimeUnit.SECONDS))
        var rolledBack: Boolean? = null
        val starter = thread { rolledBack = start() }
        starter.join(300)
        assertTrue(starter.isAlive, "the start waits for the write")
        finish.countDown()
        downloader.join(5000)
        starter.join(5000)

        // The newer bundle and its release, whole, and counted from its first load
        assertEquals(false, rolledBack)
        assertEquals("newer", bundle.readText())
        assertEquals("release 3", manifest.readText())
        assertEquals("sig of release 3", signature.readText())
        assertEquals(hash("newer"), guard.state().bundle)
        assertEquals(1, guard.state().loads)
    }

    @Test
    fun `a download during a rollback that sets its bundle aside is refused`() {
        download("good", "release 1")
        start()
        guard.confirm(hash("good"))
        download("bad", "release 2")
        repeat(BundleBootGuard.FAILED_LOADS_BEFORE_ROLLBACK) { start() }

        // The rollback holds the guard; the same bad release, downloaded meanwhile, comes after it and is refused
        val done = CountDownLatch(1)
        var refused: Boolean? = null
        guard.withLock {
            assertTrue(start())
            thread { refused = !download("bad", "release 2"); done.countDown() }
            assertFalse(done.await(200, TimeUnit.MILLISECONDS), "the download waits for the rollback")
        }
        assertTrue(done.await(5, TimeUnit.SECONDS))
        assertEquals(true, refused)
        assertEquals("good", bundle.readText())
        assertEquals("release 1", manifest.readText())
    }

    @Test
    fun `the bundle kept isn't rolled back to itself`() {
        download("good", "release 1")
        start()
        guard.confirm(hash("good"))
        download("bad", "release 2")
        // The server goes back to the same build; its counts start over without its having come up
        download("good", "release 1")
        repeat(10) { assertFalse(start()) }
        assertFalse(guard.isRejected("good".toByteArray()))
    }

    @Test
    fun `writes leave no temporary files behind`() {
        download("good", "release 1")
        start()
        guard.confirm(hash("good"))
        download("bad", "release 2")
        failedStartsUntilRollback()
        val left = dir.walkTopDown().filter { it.isFile && (it.name.endsWith(".tmp") || it.name.endsWith(".bak")) }.toList()
        assertEquals(emptyList(), left)
    }
}
