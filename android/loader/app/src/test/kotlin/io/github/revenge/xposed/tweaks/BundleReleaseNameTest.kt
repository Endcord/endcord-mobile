package io.github.revenge.xposed.tweaks

import io.github.revenge.xposed.tweaks.plugins.repos.sha256Hex
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BundleReleaseNameTest {
    private val js = "the bundle".toByteArray()
    private val hbc = "the bytecode bundle".toByteArray()
    private val apk = "a signed loader APK".toByteArray()

    private fun entry(bytes: ByteArray, url: String? = null) =
        """{ "size": ${bytes.size}, "sha256": "${sha256Hex(bytes).uppercase()}"${url?.let { """, "url": "$it"""" } ?: ""} }"""

    private val release = assertNotNull(
        BundleRelease.ofVerifiedManifest(
            """
            {
              "format": 1,
              "sequence": 42,
              "commit": "abc",
              "files": {
                "endcord.min.js": ${entry(js, "https://example/abc/endcord.min.js")},
                "endcord.v96.hbc": ${entry(hbc)},
                "endcord-xposed.apk": ${entry(apk)}
              }
            }
            """.trimIndent().toByteArray()
        )
    )

    @Test
    fun `a file counts only as the file the release lists it as`() {
        assertTrue(release.lists("endcord.min.js", js))
        assertTrue(release.lists("endcord.v96.hbc", hbc))
        assertTrue(release.lists("endcord-xposed.apk", apk))

        // The loader's APK, or the other bundle, served in the bundle's place
        assertFalse(release.lists("endcord.min.js", apk))
        assertFalse(release.lists("endcord.min.js", hbc))
        assertFalse(release.lists("endcord.v96.hbc", js))
        assertFalse(release.lists("endcord.v94.hbc", hbc))
        assertFalse(release.lists("endcord.min.js", js + 0.toByte()))
    }

    @Test
    fun `what else a release says`() {
        assertEquals(42L, release.sequence)
        assertEquals("https://example/abc/endcord.min.js", release.pinnedUrlOf("endcord.min.js"))
        assertNull(release.pinnedUrlOf("endcord.v96.hbc"))
        assertNull(BundleRelease.ofVerifiedManifest("""{ "format": 2, "sequence": 1, "files": {} }""".toByteArray()))
        assertNull(BundleRelease.ofVerifiedManifest("not json".toByteArray()))
        // Without the key the loader is built with checked, nothing is taken
        assertNull(BundleRelease.parse("""{ "format": 1, "sequence": 1, "files": {} }""".toByteArray(), ByteArray(64)))
    }
}
