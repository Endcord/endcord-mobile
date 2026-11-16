package io.github.revenge.xposed

import java.net.InetAddress
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PrivateAddressTest {
    private fun private(address: String) = isPrivateAddress(InetAddress.getByName(address))

    @Test
    fun `this device, its network and reserved ranges`() {
        for (address in listOf(
            "127.0.0.1", "127.255.255.254", "10.0.0.1", "10.0.2.2", "172.16.0.1", "172.31.255.255", "192.168.1.1",
            "169.254.169.254", "100.64.0.1", "100.127.255.255", "0.0.0.0", "192.0.2.5", "198.18.0.1", "198.19.255.255",
            "198.51.100.7", "203.0.113.9", "224.0.0.1", "239.1.2.3", "255.255.255.255",
            "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "fec0::1", "ff02::1", "2001:db8::1", "2001::1", "2002:7f00:1::",
            "::ffff:127.0.0.1", "::ffff:192.168.0.1", "64:ff9b::7f00:1", "64:ff9b::c0a8:101",
        )) assertTrue(private(address), address)
    }

    @Test
    fun `public addresses`() {
        for (address in listOf(
            "8.8.8.8", "1.1.1.1", "185.199.108.133", "140.82.112.3", "172.32.0.1", "172.15.255.255", "100.128.0.1",
            "11.0.0.1", "192.169.0.1", "2606:4700:4700::1111", "2a00:1450:4017::200e", "::ffff:8.8.8.8",
            // A public IPv4 site on an IPv6-only mobile network (NAT64)
            "64:ff9b::b9c7:6c85",
        )) assertFalse(private(address), address)
    }
}
