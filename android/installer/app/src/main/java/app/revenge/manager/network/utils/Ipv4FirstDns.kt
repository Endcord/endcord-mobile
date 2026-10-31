package app.revenge.manager.network.utils

import okhttp3.Dns
import java.net.Inet4Address
import java.net.InetAddress

/**
 * Resolves hosts like the system does but tries IPv4 addresses first.
 *
 * Google's APK servers and GitHub both publish IPv6 addresses, and on emulators and some mobile networks the
 * device has an IPv6 address that leads nowhere: OkHttp would then wait for the connection timeout on every
 * IPv6 address before falling back. IPv6 stays as a fallback for IPv6-only networks.
 */
object Ipv4FirstDns : Dns {
    override fun lookup(hostname: String): List<InetAddress> {
        val addresses = Dns.SYSTEM.lookup(hostname)
        return addresses.filterIsInstance<Inet4Address>() + addresses.filterNot { it is Inet4Address }
    }
}
