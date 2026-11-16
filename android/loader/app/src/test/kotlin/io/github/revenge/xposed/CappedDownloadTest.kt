package io.github.revenge.xposed

import kotlinx.coroutines.runBlocking
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.atomic.AtomicLong
import kotlin.concurrent.thread
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** Downloads are read into memory whole: never more than their cap ([DownloadLimits]) */
class CappedDownloadTest {
    @Test
    fun `a body within the cap is read whole`() {
        val bytes = ByteArray(100_000) { it.toByte() }
        assertContentEquals(bytes, ByteArrayInputStream(bytes).readAllCapped(100_000, "x"))
        assertContentEquals(ByteArray(0), ByteArrayInputStream(ByteArray(0)).readAllCapped(0, "x"))
    }

    @Test
    fun `one byte over the cap is refused`() {
        assertFailsWith<DownloadTooLargeException> { ByteArrayInputStream(ByteArray(100_001)).readAllCapped(100_000, "x") }
    }

    @Test
    fun `a body that never ends is cut off just past the cap`() {
        val read = AtomicLong()
        val endless = object : InputStream() {
            override fun read(): Int = 0.also { read.incrementAndGet() }
            override fun read(b: ByteArray, off: Int, len: Int): Int = len.also { read.addAndGet(it.toLong()) }
        }
        assertFailsWith<DownloadTooLargeException> { endless.readAllCapped(1_000_000, "endless") }
        assertTrue(read.get() <= 1_000_000 + DEFAULT_BUFFER_SIZE, "read ${read.get()} bytes")
    }

    @Test
    fun `progress is reported as bytes arrive`() {
        val seen = mutableListOf<Long>()
        val input = ByteArrayInputStream(ByteArray(20_000))
        readCapped(20_000, "x", onProgress = { seen += it }) { input.read(it) }
        assertEquals(20_000L, seen.last())
        assertEquals(seen.sorted(), seen)
    }

    @Test
    fun `a declared length over the cap is refused before anything is read`() {
        checkDeclaredLength(null, 10, "x")
        checkDeclaredLength(10, 10, "x")
        assertFailsWith<DownloadTooLargeException> { checkDeclaredLength(11, 10, "x") }
    }

    @Test
    fun `the limits`() {
        val mb = 1024L * 1024
        assertEquals(1 * mb, DownloadLimits.RELEASE_FILE)
        assertEquals(64 * mb, DownloadLimits.BUNDLE)
        assertEquals(8 * mb, DownloadLimits.REPO_INDEX)
        assertEquals(64 * mb, DownloadLimits.PLUGIN_ARTIFACT)
        assertEquals(64 * mb, DownloadLimits.FONT)
    }

    /** A plain HTTP server on loopback: /small (5 bytes), /declared (says 1 GB), /endless (no length, never ends) */
    private class Server : AutoCloseable {
        val socket = ServerSocket(0, 50, InetAddress.getLoopbackAddress())
        val port get() = socket.localPort
        val endlessSent = AtomicLong()

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
            val path = input.readLine().split(' ')[1]
            while (input.readLine().isNotEmpty()) Unit
            val out = client.getOutputStream()
            when (path) {
                "/small" -> out.write("HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello".toByteArray())
                "/declared" -> {
                    out.write("HTTP/1.1 200 OK\r\nContent-Length: 1073741824\r\nConnection: close\r\n\r\n".toByteArray())
                    val chunk = ByteArray(8192)
                    repeat(16) { out.write(chunk) }
                }
                "/endless" -> {
                    out.write("HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n".toByteArray())
                    val chunk = ByteArray(8192)
                    while (true) {
                        out.write(chunk)
                        endlessSent.addAndGet(chunk.size.toLong())
                    }
                }
            }
            out.flush()
        }

        override fun close() = socket.close()
    }

    private val server = Server()

    @AfterTest
    fun stop() = server.close()

    private fun Throwable.isTooLarge() = generateSequence(this) { it.cause }.any { it is DownloadTooLargeException }

    @Test
    fun `the loader's client takes a body within the cap`() = runBlocking {
        val result = httpClient.getWithETag("http://127.0.0.1:${server.port}/small", etag = null, timeoutMillis = 5_000, maxBytes = 5)
        assertEquals("hello", (result as ETagFetchResult.Fetched).bytes.decodeToString())
    }

    @Test
    fun `the loader's client refuses a body declared over the cap`() {
        val error = runBlocking {
            assertFailsWith<Throwable> {
                httpClient.getWithETag("http://127.0.0.1:${server.port}/declared", etag = null, timeoutMillis = 5_000, maxBytes = 1024)
            }
        }
        assertTrue(error.isTooLarge(), error.toString())
    }

    @Test
    fun `the loader's client stops reading a body that never ends`() {
        val error = runBlocking {
            assertFailsWith<Throwable> {
                httpClient.getWithETag("http://127.0.0.1:${server.port}/endless", etag = null, timeoutMillis = 10_000, maxBytes = 256 * 1024)
            }
        }
        assertTrue(error.isTooLarge(), error.toString())
        // What the server got out before the connection closed: socket buffers at most, nothing like a whole download
        assertTrue(server.endlessSent.get() < 64L * 1024 * 1024, "sent ${server.endlessSent.get()}")
    }
}
