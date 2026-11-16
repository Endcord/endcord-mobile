package io.github.revenge.xposed.tweaks

import io.github.revenge.xposed.tweaks.plugins.repos.sha256Hex
import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Red-team probe against BundleBootGuard clock handling.
 *
 * The guard promises that a bundle rolled back for failing to come up "isn't taken again for a day". That hold is
 * `now() - at in 0 until REJECTED_FOR_MS`, and [BundleBootGuard.pruned] drops entries the same way. If the device
 * clock moves backwards (timezone change, NTP step, manual change), `now() - at` goes negative, so the bundle is
 * treated as no longer rejected AND pruned from the state. The 24h hold fails open and the bad update can be taken
 * again immediately. SAFE behaviour: a backwards clock never shortens or clears the hold.
 *
 * Low severity: the clock is not attacker-controlled in models (a)/(b)/(c), and the guard still rolls the bad update
 * back again; the effect is wasted boots, not code execution. Kept as a documented correctness deviation.
 */
class AttackBootGuardTest {
    private val dir: File = Files.createTempDirectory("attack-boot").toFile()
    private var clock = 1_000_000_000L
    private val guard = BundleBootGuard(dir) { clock }
    private val bundle = File(dir, "bundle.js")
    private val manifest = File(dir, "endcord-release.json")
    private val signature = File(dir, "endcord-release.sig")
    private val companions = listOf(manifest, signature)

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    @Test
    fun `a rejected bundle stays rejected when the clock is wound back`() {
        bundle.writeText("good")
        manifest.writeText("r1"); signature.writeText("s1")
        guard.beforeLoad(bundle, companions)
        guard.confirm(sha256Hex("good".toByteArray()))

        // "bad" replaces "good", never comes up, and is rolled back + set aside
        guard.beforeReplacing(bundle, companions, "bad".toByteArray())
        bundle.writeText("bad"); manifest.writeText("r2"); signature.writeText("s2")
        repeat(BundleBootGuard.FAILED_LOADS_BEFORE_ROLLBACK + 1) { guard.beforeLoad(bundle, companions) }
        assertTrue(guard.isRejected("bad".toByteArray()), "precondition: bad is set aside")

        // The clock jumps backwards. The 24h hold must still apply.
        clock -= 60_000L
        assertTrue(guard.isRejected("bad".toByteArray()), "a backwards clock cleared the rejection")
    }
}
