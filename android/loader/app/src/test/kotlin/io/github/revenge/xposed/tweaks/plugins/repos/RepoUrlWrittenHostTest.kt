package io.github.revenge.xposed.tweaks.plugins.repos

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Hosts java.net.URI can't read are read as written, so an address on this device can't hide behind the form */
class RepoUrlWrittenHostTest {
    @Test
    fun `private literals in forms URI doesn't read are refused`() {
        assertFalse(isRepoUrl("https://127.0.0.1../repo"))
        assertFalse(isRepoUrl("https://user@127.0.0.1.:8443/repo"))
        assertFalse(isRepoUrl("https://192.168.1.1.?x=1"))
        assertFalse(isRepoUrl("https://10.0.0.1.#frag"))
        assertFalse(isRepoUrl("https://172.16.0.1.\\repo"))
    }

    @Test
    fun `public literals and names with a trailing dot are still links`() {
        assertTrue(isRepoUrl("https://1.1.1.1./repo"))
        assertTrue(isRepoUrl("https://example.com./repo"))
        assertTrue(isRepoUrl("https://example.com/repo"))
    }
}
