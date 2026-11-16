package io.github.revenge.xposed

import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.runBlocking
import java.net.InetSocketAddress
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails

/**
 * An update on a slow connection: the bundle is a few MB, and an update check gives the server seconds. Those seconds
 * are for the server to answer and to keep sending, not for the whole download, or a phone on a slow network never gets
 * an update.
 */
class SlowDownloadTest {
    private val chunk = ByteArray(64 * 1024) { 1 }

    private val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
        // 20 chunks over about 3 seconds: always moving, never quiet for long
        createContext("/slow") { exchange ->
            exchange.sendResponseHeaders(200, chunk.size * 20L)
            exchange.responseBody.use { out ->
                repeat(20) {
                    out.write(chunk)
                    out.flush()
                    Thread.sleep(150)
                }
            }
        }
        // Starts, then goes quiet
        createContext("/stalled") { exchange ->
            exchange.sendResponseHeaders(200, chunk.size * 2L)
            runCatching {
                exchange.responseBody.use { out ->
                    out.write(chunk)
                    out.flush()
                    Thread.sleep(3000)
                    out.write(chunk)
                }
            }
        }
        executor = java.util.concurrent.Executors.newCachedThreadPool()
        start()
    }

    private fun url(path: String) = "http://127.0.0.1:${server.address.port}$path"

    @AfterTest
    fun stop() = server.stop(0)

    @Test
    fun `a download that keeps coming finishes, however long it takes in all`() = runBlocking {
        val result = httpClient.getWithETag(url = url("/slow"), etag = null, timeoutMillis = 1000, maxBytes = DownloadLimits.BUNDLE)
        assertEquals(chunk.size * 20, (result as ETagFetchResult.Fetched).bytes.size)
    }

    @Test
    fun `a server that goes quiet still times out`() {
        runBlocking {
            assertFails { httpClient.getWithETag(url = url("/stalled"), etag = null, timeoutMillis = 1000, maxBytes = DownloadLimits.BUNDLE) }
        }
    }
}
