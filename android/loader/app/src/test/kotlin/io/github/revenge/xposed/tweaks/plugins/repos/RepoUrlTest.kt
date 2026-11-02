package io.github.revenge.xposed.tweaks.plugins.repos

import io.github.revenge.Logger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RepoUrlTest {
    @Test
    fun `https links are repository links`() {
        assertTrue(isRepoUrl("https://plugins.example/repo"))
        assertTrue(isRepoUrl("HTTPS://plugins.example/repo/index.json"))
    }

    @Test
    fun `plain http is only for this machine`() {
        assertTrue(isRepoUrl("http://localhost:4040/repo"))
        assertTrue(isRepoUrl("http://127.0.0.1/repo"))
        assertTrue(isRepoUrl("http://[::1]:8080/"))
        assertTrue(isRepoUrl("http://10.0.2.2:4040"))

        assertFalse(isRepoUrl("http://plugins.example/repo"))
        assertFalse(isRepoUrl("http://localhost.example/repo"))
        assertFalse(isRepoUrl("http://10.0.2.2.example/repo"))
        assertFalse(isRepoUrl("ftp://plugins.example/repo"))
        assertFalse(isRepoUrl("plugins.example/repo"))
    }

    @Test
    fun `an index drops versions whose artifact is on plain http`() {
        val json = """
            {
              "format": 1,
              "name": "Test",
              "plugins": {
                "com.example.a": {
                  "name": "A",
                  "channels": { "latest": "1.0.0", "testing": "1.1.0" },
                  "versions": {
                    "1.0.0": { "url": "https://a.example/a-1.0.0.zip", "sha256": "${"a".repeat(64)}", "size": 1 },
                    "1.1.0": { "url": "http://a.example/a-1.1.0.zip", "sha256": "${"a".repeat(64)}", "size": 1 }
                  }
                }
              }
            }
        """.trimIndent()

        val index = parseRepoIndex(json, "https://a.example", Logger("test"))

        val plugin = index.plugins.getValue("com.example.a")
        assertEquals(setOf("1.0.0"), plugin.versions.keys)
        assertEquals(mapOf("latest" to "1.0.0"), plugin.channels)
    }
}
