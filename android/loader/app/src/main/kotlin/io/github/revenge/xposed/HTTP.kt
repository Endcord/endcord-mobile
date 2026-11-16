package io.github.revenge.xposed

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.okhttp.*
import io.ktor.client.plugins.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.utils.io.readAvailable
import java.net.InetAddress
import java.net.Proxy

/** This machine, which a developer's own bundle or plugin may be served from over plain http (see isRepoUrl) */
internal val OWN_MACHINE_HOSTS = setOf("localhost", "127.0.0.1", "::1", "[::1]", "10.0.2.2")

/**
 * Resolves like the system but tries IPv4 first: emulators and some mobile networks have an IPv6 address that
 * leads nowhere, and OkHttp would wait for the timeout on every IPv6 address before falling back.
 *
 * A name that resolves to an address on this device or its network is refused, as on Endcord PC: the check happens as
 * the connection is made, so a DNS server can't answer differently for it than it did before (DNS rebinding). The
 * addresses fake-IP VPN apps answer with are let through ([isPrivateConnectAddress]).
 */
private object Ipv4FirstDns : okhttp3.Dns {
    override fun lookup(hostname: String): List<InetAddress> {
        val addresses = okhttp3.Dns.SYSTEM.lookup(hostname)
        if (hostname.lowercase() !in OWN_MACHINE_HOSTS && addresses.any(::isPrivateConnectAddress)) {
            throw java.net.UnknownHostException("$hostname resolves to an address on this device or its network")
        }
        return addresses.filterIsInstance<java.net.Inet4Address>() + addresses.filterNot { it is java.net.Inet4Address }
    }
}

/** A connection that went to an address on this device or its network, which nothing here is fetched from */
internal class PrivateAddressException(message: String) : java.io.IOException(message)

/**
 * Whether a request to [host] may go over a connection made through [proxy] to [address]. The DNS check above never
 * sees an address written in a link (OkHttp takes "127.0.0.1." or "2130706433" as one too), nor where a redirect goes,
 * so the address the connection really went to is checked as well, with the same rule. Not through a proxy, which is
 * the user's own and resolves names itself, and not for this machine, where a developer serves their own builds.
 */
internal fun connectionAllowed(host: String, proxy: Proxy, address: InetAddress?): Boolean {
    if (proxy.type() != Proxy.Type.DIRECT) return true
    if (host.lowercase() in OWN_MACHINE_HOSTS) return true
    return address != null && !isPrivateConnectAddress(address)
}

/** Fails a request whose connection went somewhere [connectionAllowed] doesn't allow, before anything is sent on it */
internal object PrivateAddressInterceptor : okhttp3.Interceptor {
    override fun intercept(chain: okhttp3.Interceptor.Chain): okhttp3.Response {
        val connection = chain.connection() ?: return chain.proceed(chain.request())
        val route = connection.route()
        val host = chain.request().url.host
        if (!connectionAllowed(host, route.proxy, route.socketAddress.address)) {
            // Closed, so the pool doesn't keep it for the next request
            runCatching { connection.socket().close() }
            throw PrivateAddressException("$host connects to an address on this device or its network")
        }
        return chain.proceed(chain.request())
    }
}

internal val httpClient by lazy {
    HttpClient(OkHttp) {
        engine {
            config {
                dns(Ipv4FirstDns)
                addNetworkInterceptor(PrivateAddressInterceptor)
            }
        }
        expectSuccess = false
        install(UserAgent) { agent = RevengeConstants.USER_AGENT }
        install(HttpRedirect) {}
        install(HttpTimeout) {}
    }
}

internal sealed class ETagFetchResult {
    /** A fresh body was fetched. */
    class Fetched(val bytes: ByteArray, val etag: String?) : ETagFetchResult()

    /** The server responded `304 Not Modified`. The cached copy is up-to-date. */
    object NotModified : ETagFetchResult()
}

/**
 * The most the loader takes of each kind of download. Everything is read into memory whole, so a server that sends more
 * (or a body that never ends) is cut off there rather than filling the memory: refused by its Content-Length when it
 * gives one, and otherwise once more than that has arrived.
 */
internal object DownloadLimits {
    private const val MB = 1024L * 1024

    /** A signed release's manifest, and its signature */
    const val RELEASE_FILE = 1 * MB
    const val BUNDLE = 64 * MB

    /** The bundle manifest a custom bundle link names: a JSON list, like a repository index */
    const val BUNDLE_MANIFEST = 8 * MB
    const val REPO_INDEX = 8 * MB

    /** A plugin's ZIP from a repository; never more than the size its index gives either */
    const val PLUGIN_ARTIFACT = 64 * MB
    const val FONT = 64 * MB
}

/** A download bigger than [DownloadLimits] allows for its kind */
internal class DownloadTooLargeException(message: String) : java.io.IOException(message)

/** Refuses a download by its declared length (Content-Length), when it gives one, before anything of it is read */
internal fun checkDeclaredLength(declared: Long?, limit: Long, what: String) {
    if (declared != null && declared > limit) {
        throw DownloadTooLargeException("$what is $declared bytes, more than the $limit allowed")
    }
}

/**
 * Reads a body whole, but never more than [limit] bytes of it: [read] fills the buffer it's given and returns how many
 * bytes it put there, or -1 at the end. Stops and throws as soon as more than [limit] have arrived, whatever the server
 * said the length would be. [onProgress] gets the bytes read so far.
 */
internal inline fun readCapped(
    limit: Long,
    what: String,
    onProgress: (Long) -> Unit = {},
    read: (ByteArray) -> Int,
): ByteArray {
    val out = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    var total = 0L
    while (true) {
        val count = read(buffer)
        if (count < 0) break
        total += count
        if (total > limit) throw DownloadTooLargeException("$what is more than the $limit bytes allowed")
        out.write(buffer, 0, count)
        onProgress(total)
    }
    return out.toByteArray()
}

/** [readCapped] for a stream */
internal fun java.io.InputStream.readAllCapped(limit: Long, what: String): ByteArray = readCapped(limit, what) { read(it) }

/**
 * The body of a response, read as it arrives and capped as in [readCapped]. Only for a response being streamed (inside
 * `prepareGet(...).execute { }`): a plain `get` has already read all of it into memory.
 */
internal suspend fun HttpResponse.bodyCapped(limit: Long, what: String, onProgress: (Long) -> Unit = {}): ByteArray {
    checkDeclaredLength(contentLength(), limit, what)
    val channel = bodyAsChannel()
    return readCapped(limit, what, onProgress) { channel.readAvailable(it, 0, it.size) }
}

/** [maxBytes]: the most of the body that's taken, from [DownloadLimits] */
/**
 * However slow the connection, a download that keeps coming may take this long in all. Ktor's request timeout counts
 * the whole body too: as the only limit, the bundle (2.5 MB) needed 4 Mbit/s to arrive within the 5 seconds an update
 * check had, and on anything slower every update was cut off, quietly, at every start.
 */
internal const val MAX_TRANSFER_MILLIS = 5 * 60_000L

/**
 * [timeoutMillis]: how long the server may take to connect, and to go quiet once it's answering; not how long the whole
 * download may take ([MAX_TRANSFER_MILLIS]).
 */
internal suspend fun HttpClient.getWithETag(
    url: String,
    etag: String?,
    timeoutMillis: Long? = null,
    maxBytes: Long,
): ETagFetchResult = prepareGet(url) {
    etag?.let { headers.append(HttpHeaders.IfNoneMatch, it) }
    timeoutMillis?.let { idle ->
        timeout {
            connectTimeoutMillis = idle
            socketTimeoutMillis = idle
            requestTimeoutMillis = maxOf(idle, MAX_TRANSFER_MILLIS)
        }
    }
}.execute { response ->
    when (response.status) {
        HttpStatusCode.OK -> ETagFetchResult.Fetched(
            bytes = response.bodyCapped(maxBytes, url),
            etag = response.headers[HttpHeaders.ETag]?.takeIf { it.isNotEmpty() },
        )

        HttpStatusCode.NotModified -> ETagFetchResult.NotModified

        else -> throw ResponseException(response, "Received status: ${response.status}")
    }
}
