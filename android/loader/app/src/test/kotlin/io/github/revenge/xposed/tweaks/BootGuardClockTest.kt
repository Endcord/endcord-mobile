package io.github.revenge.xposed.tweaks

import io.github.revenge.xposed.tweaks.plugins.repos.sha256Hex
import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** A bundle set aside stays set aside for its day whatever the clock does, and no longer than a day from a clock gone back */
class BootGuardClockTest {
    private val dir: File = Files.createTempDirectory("boot-clock").toFile()
    private var clock = 1_000_000_000_000L
    private val guard = BundleBootGuard(dir) { clock }
    private val bundle = File(dir, "bundle.js")
    private val companions = listOf(File(dir, "endcord-release.json"), File(dir, "endcord-release.sig"))
    private val day = BundleBootGuard.REJECTED_FOR_MS

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    /** "good" came up, "bad" replaced it and didn't: set aside at the clock as it is */
    private fun rejectBad() {
        bundle.writeText("good")
        guard.beforeLoad(bundle, companions)
        guard.confirm(sha256Hex("good".toByteArray()))
        guard.beforeReplacing(bundle, companions, "bad".toByteArray())
        bundle.writeText("bad")
        repeat(BundleBootGuard.FAILED_LOADS_BEFORE_ROLLBACK + 1) { guard.beforeLoad(bundle, companions) }
        assertTrue(guard.isRejected("bad".toByteArray()))
    }

    @Test
    fun `a clock gone back keeps it set aside, and a write doesn't prune it`() {
        rejectBad()
        clock -= 3_600_000L
        assertTrue(guard.isRejected("bad".toByteArray()))
        // A state write prunes the list: it stays, at the clock as it is now
        guard.beforeReplacing(bundle, companions, "other".toByteArray())
        assertEquals(clock, guard.state().rejected[sha256Hex("bad".toByteArray())])
        assertTrue(guard.isRejected("bad".toByteArray()))
    }

    @Test
    fun `from a clock gone back, the day runs from the clock as it is`() {
        rejectBad()
        clock -= 365L * day
        guard.beforeReplacing(bundle, companions, "other".toByteArray())
        clock += day - 1
        assertTrue(guard.isRejected("bad".toByteArray()))
        clock += 1
        assertFalse(guard.isRejected("bad".toByteArray()))
    }

    @Test
    fun `with the clock going forward, the day still ends`() {
        rejectBad()
        clock += day - 1
        assertTrue(guard.isRejected("bad".toByteArray()))
        clock += 1
        assertFalse(guard.isRejected("bad".toByteArray()))
        guard.beforeReplacing(bundle, companions, "other".toByteArray())
        assertFalse(sha256Hex("bad".toByteArray()) in guard.state().rejected)
    }
}
