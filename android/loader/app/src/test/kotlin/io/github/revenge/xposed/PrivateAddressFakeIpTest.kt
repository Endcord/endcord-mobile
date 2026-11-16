package io.github.revenge.xposed

import java.net.Inet6Address
import java.net.InetAddress
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class PrivateAddressFakeIpTest {
    private fun inLink(address: String) = isPrivateAddress(InetAddress.getByName(address))
    private fun connecting(address: String) = isPrivateConnectAddress(InetAddress.getByName(address))

    @Test
    fun `what fake-IP VPN apps answer names with can be connected to, but isn't taken in a link`() {
        // Clash, sing-box and v2rayNG's FakeDNS hand out 198.18.0.0/15; sing-box fc00::/18 for IPv6
        for (address in listOf("198.18.0.1", "198.18.255.254", "198.19.0.7", "198.19.255.255", "fc00::1", "fc00:1:2::3", "fcff:ffff::1")) {
            assertFalse(connecting(address), address)
            assertTrue(inLink(address), address)
        }
    }

    @Test
    fun `the unique local addresses home routers hand out stay private`() {
        for (address in listOf("fd00::1", "fd12:3456:789a::1", "fdff:ffff:ffff::ffff")) {
            assertTrue(connecting(address), address)
            assertTrue(inLink(address), address)
        }
    }

    @Test
    fun `everything else is as private to connect to as in a link`() {
        for (address in listOf(
            "127.0.0.1", "10.0.0.1", "10.0.2.2", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
            "192.0.2.5", "198.51.100.7", "203.0.113.9", "224.0.0.1", "255.255.255.255",
            "::1", "::", "fe80::1", "fec0::1", "ff02::1", "2001:db8::1", "2002:c0a8:101::", "::ffff:192.168.0.1",
            "64:ff9b::c0a8:101",
        )) assertTrue(connecting(address), address)
        for (address in listOf("8.8.8.8", "198.17.255.255", "198.20.0.1", "2606:4700:4700::1111", "64:ff9b::808:808")) {
            assertFalse(connecting(address), address)
            assertFalse(inLink(address), address)
        }
    }

    @Test
    fun `an IPv4-compatible IPv6 address is checked as the IPv4 address inside`() {
        assertIs<Inet6Address>(InetAddress.getByName("::127.0.0.1"))
        for (address in listOf("::127.0.0.1", "::10.0.0.1", "::192.168.1.1", "::169.254.169.254", "::0.0.0.2", "::", "::1")) {
            assertTrue(inLink(address), address)
            assertTrue(connecting(address), address)
        }
        assertFalse(inLink("::8.8.8.8"))
        assertFalse(connecting("::8.8.8.8"))
    }

    @Test
    fun `an IPv4-mapped address held as IPv6 is the IPv4 address`() {
        val bytes = ByteArray(16).also { it[10] = 0xff.toByte(); it[11] = 0xff.toByte() }
        val mapped = { a: Int, b: Int, c: Int, d: Int ->
            Inet6Address.getByAddress(null, bytes.copyOf().also { it[12] = a.toByte(); it[13] = b.toByte(); it[14] = c.toByte(); it[15] = d.toByte() }, null)
        }
        assertTrue(isPrivateConnectAddress(mapped(192, 168, 1, 1)))
        assertTrue(isPrivateConnectAddress(mapped(127, 0, 0, 1)))
        assertFalse(isPrivateConnectAddress(mapped(8, 8, 8, 8)))
    }

    @Test
    fun `NAT64 for a network's own use is private, whatever the address inside`() {
        for (address in listOf("64:ff9b:1::1", "64:ff9b:1::808:808", "64:ff9b:1:ffff:ffff:ffff:ffff:ffff")) {
            assertTrue(inLink(address), address)
            assertTrue(connecting(address), address)
        }
        // The well-known prefix still checks the IPv4 address inside, for IPv6-only mobile networks
        assertFalse(connecting("64:ff9b::b9c7:6c85"))
        assertTrue(connecting("64:ff9b::7f00:1"))
    }
}
