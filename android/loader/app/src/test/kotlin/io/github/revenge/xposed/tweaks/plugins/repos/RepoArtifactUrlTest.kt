package io.github.revenge.xposed.tweaks.plugins.repos

import io.github.revenge.Logger
import io.github.revenge.xposed.tweaks.plugins.PluginSystemError
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RepoArtifactUrlTest {
    private val thisMachine = listOf(
        "http://127.0.0.1:8080/admin/delete?all=1",
        "http://localhost:4040/a.zip",
        "HTTP://LOCALHOST/a.zip",
        "http://10.0.2.2/a.zip",
        "http://[::1]:8080/a.zip",
        "https://localhost:8443/a.zip",
    )

    @Test
    fun `a repository elsewhere only names https artifacts elsewhere`() {
        val repo = "https://plugins.example/repo"
        assertTrue(isRepoArtifactUrl("https://cdn.example/a-1.0.0.zip", repo))
        for (url in thisMachine) assertFalse(isRepoArtifactUrl(url, repo), url)
        assertFalse(isRepoArtifactUrl("http://cdn.example/a.zip", repo))
        assertFalse(isRepoArtifactUrl("https://192.168.1.1/a.zip", repo))
    }

    @Test
    fun `a repository on this machine may name artifacts on it`() {
        for (repo in listOf("http://localhost:4040", "http://127.0.0.1:4040/repo", "http://10.0.2.2:4040", "http://[::1]:4040")) {
            for (url in thisMachine) assertTrue(isRepoArtifactUrl(url, repo), "$repo -> $url")
            assertTrue(isRepoArtifactUrl("https://cdn.example/a.zip", repo), repo)
            assertFalse(isRepoArtifactUrl("http://cdn.example/a.zip", repo), repo)
        }
    }

    private fun index(artifact: String) = """
        {
          "format": 1,
          "name": "Test",
          "plugins": {
            "com.example.a": {
              "name": "A",
              "channels": { "latest": "1.0.0", "testing": "1.1.0" },
              "versions": {
                "1.0.0": { "url": "https://a.example/a-1.0.0.zip", "sha256": "${"a".repeat(64)}", "size": 1 },
                "1.1.0": { "url": "$artifact", "sha256": "${"a".repeat(64)}", "size": 1 }
              }
            }
          }
        }
    """.trimIndent()

    @Test
    fun `an index from elsewhere drops versions on this machine`() {
        for (artifact in thisMachine) {
            val plugin = parseRepoIndex(index(artifact), "https://a.example", Logger("test")).plugins.getValue("com.example.a")
            assertEquals(setOf("1.0.0"), plugin.versions.keys, artifact)
            assertEquals(mapOf("latest" to "1.0.0"), plugin.channels, artifact)
        }
    }

    @Test
    fun `an index on this machine keeps them`() {
        val plugin = parseRepoIndex(index("http://127.0.0.1:4040/a-1.1.0.zip"), "http://localhost:4040", Logger("test"))
            .plugins.getValue("com.example.a")
        assertEquals(setOf("1.0.0", "1.1.0"), plugin.versions.keys)
    }

    private fun action(url: String, repo: String) = mapOf(
        "id" to "com.example.a", "version" to "1.1.0", "url" to url, "sha256" to "a".repeat(64), "size" to 1, "repo" to repo,
    )

    @Test
    fun `an install plan follows the same rule for its repository`() {
        assertFailsWith<PluginSystemError> { parseRepoInstallAction(action("http://127.0.0.1:8080/x.zip", "https://a.example")) }
        assertFailsWith<PluginSystemError> { parseRepoInstallAction(action("https://localhost/x.zip", "https://a.example")) }
        assertEquals("http://127.0.0.1:4040/x.zip", parseRepoInstallAction(action("http://127.0.0.1:4040/x.zip", "http://localhost:4040")).url)
        assertEquals("https://a.example/x.zip", parseRepoInstallAction(action("https://a.example/x.zip", "https://a.example")).url)
    }
}
