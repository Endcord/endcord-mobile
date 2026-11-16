package io.github.revenge.xposed

import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.ServerSocket
import java.net.Socket
import java.net.UnknownHostException
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PrivateConnectionTest {
    /** A plain HTTP server on this machine's loopback: one request per connection, 302 to [redirects], else 200 */
    private class Server : AutoCloseable {
        val socket = ServerSocket(0, 50, InetAddress.getLoopbackAddress())
        val port get() = socket.localPort
        val requests = CopyOnWriteArrayList<String>()
        val redirects = mutableMapOf<String, String>()

        init {
            thread(isDaemon = true) {
                while (!socket.isClosed) {
                    val client = runCatching { socket.accept() }.getOrNull() ?: break
                    thread(isDaemon = true) { runCatching { client.use(::handle) } }
                }
            }
        }

        private fun handle(client: Socket) {
            val input = client.getInputStream().bufferedReader()
            val requestLine = input.readLine() ?: return
            while (!input.readLine().isNullOrEmpty()) Unit
            requests += requestLine
            val target = requestLine.split(" ")[1]
            val location = redirects[target]
            val body = if (target.startsWith("http://")) "proxied" else "ok"
            val head = if (location != null) "HTTP/1.1 302 Found\r\nLocation: $location\r\n" else "HTTP/1.1 200 OK\r\n"
            client.getOutputStream().apply {
                write("${head}Content-Length: ${body.length}\r\nConnection: close\r\n\r\n$body".toByteArray())
                flush()
            }
        }

        override fun close() = socket.close()
    }

    private val server = Server()
    private val loopback = InetAddress.getLoopbackAddress()

    /** Answers like a DNS server rebinding a name to this machine, which the loader's own DNS check isn't there to see */
    private val client = OkHttpClient.Builder()
        .dns(object : okhttp3.Dns {
            override fun lookup(hostname: String): List<InetAddress> = when (hostname) {
                "rebind.example", "localhost" -> listOf(loopback)
                else -> throw UnknownHostException(hostname)
            }
        })
        .addNetworkInterceptor(PrivateAddressInterceptor)
        .callTimeout(10, TimeUnit.SECONDS)
        .build()

    @AfterTest
    fun cleanUp() = server.close()

    private fun get(c: OkHttpClient, url: String) = c.newCall(Request.Builder().url(url).build()).execute().use { it.code to it.body.string() }

    @Test
    fun `the rule for a connection`() {
        val direct = Proxy.NO_PROXY
        val proxy = Proxy(Proxy.Type.HTTP, InetSocketAddress.createUnresolved("127.0.0.1", 8080))
        val socks = Proxy(Proxy.Type.SOCKS, InetSocketAddress.createUnresolved("127.0.0.1", 1080))
        fun ip(address: String) = InetAddress.getByName(address)

        assertFalse(connectionAllowed("rebind.example", direct, ip("192.168.1.1")))
        assertFalse(connectionAllowed("rebind.example", direct, ip("127.0.0.1")))
        assertFalse(connectionAllowed("2130706433", direct, ip("127.0.0.1")))
        assertFalse(connectionAllowed("127.0.0.1.", direct, ip("127.0.0.1")))
        assertFalse(connectionAllowed("rebind.example", direct, ip("fd00::1")))
        assertFalse(connectionAllowed("rebind.example", direct, null))
        assertTrue(connectionAllowed("discord.com", direct, ip("162.159.135.232")))
        // What fake-IP VPN apps answer with
        assertTrue(connectionAllowed("discord.com", direct, ip("198.18.0.42")))
        assertTrue(connectionAllowed("discord.com", direct, ip("fc00::2a")))
        // The developer's own machine
        for (host in listOf("localhost", "LOCALHOST", "127.0.0.1", "::1", "10.0.2.2")) {
            assertTrue(connectionAllowed(host, direct, ip("127.0.0.1")), host)
        }
        assertTrue(connectionAllowed("10.0.2.2", direct, ip("10.0.2.2")))
        // A proxy is the user's own: what it connects to is its business
        assertTrue(connectionAllowed("rebind.example", proxy, ip("127.0.0.1")))
        assertTrue(connectionAllowed("rebind.example", socks, ip("127.0.0.1")))
    }

    @Test
    fun `a name that leads to this machine is refused before the request is sent`() {
        assertFailsWith<PrivateAddressException> { get(client, "http://rebind.example:${server.port}/secret") }
        assertEquals(emptyList(), server.requests)
    }

    @Test
    fun `a redirect to an address on this device is refused`() {
        server.redirects["/start"] = "http://rebind.example:${server.port}/secret"
        assertFailsWith<PrivateAddressException> { get(client, "http://127.0.0.1:${server.port}/start") }
        assertEquals(listOf("GET /start HTTP/1.1"), server.requests)
    }

    @Test
    fun `this machine itself still works, as developers serve their builds from it`() {
        assertEquals(200 to "ok", get(client, "http://127.0.0.1:${server.port}/endcord.min.js"))
        assertEquals(200 to "ok", get(client, "http://localhost:${server.port}/endcord.min.js"))
    }

    @Test
    fun `through a proxy nothing is refused`() {
        val proxied = client.newBuilder().proxy(Proxy(Proxy.Type.HTTP, InetSocketAddress(loopback, server.port))).build()
        assertEquals(200 to "proxied", get(proxied, "http://rebind.example/x"))
    }

    @Test
    fun `the loader's client still fetches from this machine`() = runBlocking {
        assertEquals("ok", httpClient.get("http://127.0.0.1:${server.port}/endcord.min.js").bodyAsText())
        assertEquals("ok", httpClient.get("http://localhost:${server.port}/endcord.min.js").bodyAsText())
    }

    @Test
    fun `the loader's client refuses an address on this device written as a number`() {
        val error = runBlocking {
            assertFailsWith<java.io.IOException> { httpClient.get("http://2130706433:${server.port}/secret") }
        }
        assertTrue(generateSequence<Throwable>(error) { it.cause }.any { it is PrivateAddressException }, error.toString())
        assertEquals(emptyList(), server.requests)
    }
}
