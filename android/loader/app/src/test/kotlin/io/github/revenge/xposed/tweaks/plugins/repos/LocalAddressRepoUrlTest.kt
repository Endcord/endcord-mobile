package io.github.revenge.xposed.tweaks.plugins.repos

import io.github.revenge.xposed.tweaks.unsignedReleaseAllowed
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class LocalAddressRepoUrlTest {
    @Test
    fun `https links and the developer's own machine`() {
        for (url in listOf(
            "https://raw.githubusercontent.com/Endcord/endcord-mobile/builds-next/endcord.min.js",
            "https://8.8.8.8/x.js",
            "https://[2606:4700:4700::1111]/x.js",
            "http://localhost:4040/endcord.min.js",
            "http://10.0.2.2:4040/endcord.min.js",
            "http://127.0.0.1/x",
            "http://[::1]:4040/x",
        )) assertTrue(isRepoUrl(url), url)
    }

    @Test
    fun `plain http elsewhere, and https to this device or its network`() {
        for (url in listOf(
            "http://example.com/x.js",
            "http://192.168.1.5:4040/x.js",
            "https://192.168.1.5/x.js",
            "https://127.0.0.1/x.js",
            "https://10.0.2.2/x.js",
            "https://[::1]/x.js",
            "https://[fd00::1]/x.js",
            "https://169.254.169.254/latest",
            "javascript:alert(1)",
            "file:///data/data/com.discord/files/x",
        )) assertFalse(isRepoUrl(url), url)
    }

    @Test
    fun `an unsigned bundle only before any signed release, and never in a strict build`() {
        assertTrue(unsignedReleaseAllowed(requireSigned = false, acceptedSequence = 0))
        assertFalse(unsignedReleaseAllowed(requireSigned = false, acceptedSequence = 1))
        assertFalse(unsignedReleaseAllowed(requireSigned = true, acceptedSequence = 0))
        assertFalse(unsignedReleaseAllowed(requireSigned = true, acceptedSequence = 42))
    }
}
