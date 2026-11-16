package io.github.revenge.xposed.tweaks.plugins.repos

import kotlin.test.Test
import kotlin.test.assertFalse

/**
 * `hasPrivateLiteralHost` is meant to refuse an https link that "names an address on this device or its network
 * outright". A trailing dot on an IPv4 literal (`127.0.0.1.`, `192.168.0.1.`) denotes the very same address, but it
 * slips past the IPV4_LITERAL check, so [isRepoUrl] accepts it as a public https repository/custom-bundle URL.
 *
 * The connect-time interceptor still refuses the actual connection, so this is a defence-in-depth gap rather than a
 * full SSRF, but the literal-host rule should hold on its own. SAFE behaviour: these are not repo URLs.
 */
class AttackRepoUrlTest {
    @Test
    fun `an ipv4 literal on this device or network with a trailing dot is not a repo url`() {
        assertFalse(isRepoUrl("https://127.0.0.1./repo"), "loopback with trailing dot accepted as a repo URL")
        assertFalse(isRepoUrl("https://192.168.0.1./repo"), "LAN address with trailing dot accepted as a repo URL")
        assertFalse(isRepoUrl("https://10.0.0.5./repo"), "private address with trailing dot accepted as a repo URL")
        assertFalse(isRepoUrl("https://169.254.169.254./latest"), "link-local with trailing dot accepted as a repo URL")
    }
}
