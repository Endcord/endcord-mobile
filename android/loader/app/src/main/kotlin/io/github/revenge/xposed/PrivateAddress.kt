package io.github.revenge.xposed

import java.net.InetAddress

/**
 * Endcord PC's private address ranges (src/main/utils/http.ts there): this device, its network, and the ranges reserved
 * for documentation and tests. What the loader downloads must not come from them, so a name that a hostile DNS server
 * points at the router or at the phone itself (DNS rebinding) is refused at connect time.
 *
 * One difference for phones: IPv6-only mobile networks give public IPv4 sites addresses in 64:ff9b::/96 (NAT64), so
 * there the IPv4 address inside is what's checked, rather than the whole range being refused as on Endcord PC.
 */
private class Range(network: String, val prefix: Int) {
    val bytes: ByteArray = InetAddress.getByName(network).address

    fun contains(address: ByteArray): Boolean {
        if (address.size != bytes.size) return false
        var bits = prefix
        for (i in bytes.indices) {
            if (bits <= 0) return true
            val mask = if (bits >= 8) 0xff else (0xff shl (8 - bits)) and 0xff
            if ((address[i].toInt() and mask) != (bytes[i].toInt() and mask)) return false
            bits -= 8
        }
        return true
    }
}

private val V4 = listOf(
    Range("0.0.0.0", 8), Range("10.0.0.0", 8), Range("100.64.0.0", 10), Range("127.0.0.0", 8), Range("169.254.0.0", 16),
    Range("172.16.0.0", 12), Range("192.0.0.0", 24), Range("192.0.2.0", 24), Range("192.168.0.0", 16),
    Range("198.51.100.0", 24), Range("203.0.113.0", 24), Range("224.0.0.0", 3),
)

private val V6 = listOf(
    Range("::", 128), Range("::1", 128), Range("100::", 64), Range("2001::", 32), Range("2001:db8::", 32),
    // fd00::/8 is the half of the unique local range that home routers really hand out
    Range("2002::", 16), Range("fd00::", 8), Range("fe80::", 10), Range("fec0::", 10), Range("ff00::", 8),
    // NAT64 for a network's own use (RFC 8215), unlike the well-known prefix below: what's inside isn't a public site
    Range("64:ff9b:1::", 48),
)

/**
 * The benchmarking range 198.18.0.0/15 and the other half of the unique local range, fc00::/8: fake-IP VPN and proxy
 * apps (Clash and Clash Meta, sing-box and the apps built on it, v2rayNG's FakeDNS) answer every name with an address
 * from them and route it to the real site, and many who use Discord where it's blocked rely on them. They're refused
 * when written in a link, but not as what a name resolves to or what a connection goes to.
 */
private val V4_FAKE_IP = Range("198.18.0.0", 15)
private val V6_FAKE_IP = Range("fc00::", 8)

private val NAT64 = Range("64:ff9b::", 96)

/**
 * Whether an address is this device, its network, or reserved; see the top of this file. With [fakeIpAllowed], the
 * ranges fake-IP VPN apps answer names with aren't counted ([V4_FAKE_IP]).
 */
internal fun isPrivateAddress(address: InetAddress, fakeIpAllowed: Boolean = false): Boolean {
    val bytes = address.address
    fun v4(ipv4: ByteArray) = V4.any { it.contains(ipv4) } || (!fakeIpAllowed && V4_FAKE_IP.contains(ipv4))

    if (bytes.size == 4) return v4(bytes)
    // ::ffff:a.b.c.d is an IPv4 address
    if ((0 until 10).all { bytes[it].toInt() == 0 } && bytes[10].toInt() and 0xff == 0xff && bytes[11].toInt() and 0xff == 0xff) {
        return v4(bytes.copyOfRange(12, 16))
    }
    // ::a.b.c.d (IPv4-compatible, long deprecated) is checked as the IPv4 address too; :: and ::1 come out private
    if ((0 until 12).all { bytes[it].toInt() == 0 }) return v4(bytes.copyOfRange(12, 16))
    if (NAT64.contains(bytes)) return v4(bytes.copyOfRange(12, 16))
    return V6.any { it.contains(bytes) } || (!fakeIpAllowed && V6_FAKE_IP.contains(bytes))
}

/**
 * The check for what a name resolved to and for the address a connection is made to (HTTP.kt): private as above,
 * except for the ranges fake-IP VPN apps answer every name with, which would otherwise leave their users with nothing.
 */
internal fun isPrivateConnectAddress(address: InetAddress): Boolean = isPrivateAddress(address, fakeIpAllowed = true)
