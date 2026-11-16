package io.github.revenge.xposed.tweaks

import io.github.revenge.xposed.tweaks.plugins.repos.sha256Hex
import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Which preloads run: only Endcord's own in an app that isn't a developer's build, all of them in one that is */
class PreloadPlanTest {
    private val dir: File = Files.createTempDirectory("preloads").toFile()

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    private fun file(name: String, text: String) = File(dir, name).apply { writeText(text) }

    private val hashOf = { f: File -> runCatching { sha256Hex(f.readBytes()) }.getOrNull() }

    @Test
    fun `the allowlist is React DevTools 7_0_1 alone`() {
        assertEquals(setOf("63ed06bb1a1b6d023f9b98fe0897aa5817045bba0950bef20604918d82b7f18b"), PRELOAD_ALLOWLIST)
    }

    @Test
    fun `outside a debuggable app only files on the allowlist run`() {
        val own = file("reactDevtools.js", "devtools")
        val planted = file("evil.js", "steal()")
        val renamed = file("reactDevtools2.js", "devtools, changed")
        val plan = planPreloads(listOf(own, planted, renamed), debuggable = false, sha256Of = hashOf, allowlist = setOf(sha256Hex("devtools".toByteArray())))
        assertEquals(listOf(own), plan.run)
        assertEquals(listOf(planted, renamed), plan.refused)
    }

    @Test
    fun `a file whose name matches but whose contents don't is refused`() {
        val fake = file("reactDevtools.js", "not devtools")
        val plan = planPreloads(listOf(fake), debuggable = false, sha256Of = hashOf)
        assertEquals(emptyList(), plan.run)
        assertEquals(listOf(fake), plan.refused)
    }

    @Test
    fun `a file that can't be read is refused`() {
        val gone = File(dir, "gone.js")
        val plan = planPreloads(listOf(gone), debuggable = false, sha256Of = hashOf, allowlist = setOf(sha256Hex(ByteArray(0))))
        assertEquals(listOf(gone), plan.refused)
    }

    @Test
    fun `the digest is compared without regard to case`() {
        val own = file("a.js", "devtools")
        val upper = { f: File -> hashOf(f)?.uppercase() }
        val plan = planPreloads(listOf(own), debuggable = false, sha256Of = upper, allowlist = setOf(sha256Hex("devtools".toByteArray())))
        assertEquals(listOf(own), plan.run)
    }

    @Test
    fun `in a debuggable app everything runs, unhashed, in order`() {
        val files = listOf(file("a.js", "1"), file("b.js", "2"), file("c.js", "3"))
        var hashed = 0
        val plan = planPreloads(files, debuggable = true, sha256Of = { hashed++; null })
        assertEquals(files, plan.run)
        assertTrue(plan.refused.isEmpty())
        assertEquals(0, hashed)
    }

    @Test
    fun `nothing to run`() {
        val plan = planPreloads(emptyList(), debuggable = false, sha256Of = hashOf)
        assertTrue(plan.run.isEmpty() && plan.refused.isEmpty())
    }
}
