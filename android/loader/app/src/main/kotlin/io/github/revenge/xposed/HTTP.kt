package io.github.revenge.xposed

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.okhttp.*
import io.ktor.client.plugins.*
import io.ktor.client.request.*
import io.ktor.http.*

/**
 * Resolves like the system but tries IPv4 first: emulators and some mobile networks have an IPv6 address that
 * leads nowhere, and OkHttp would wait for the timeout on every IPv6 address before falling back.
 */
private object Ipv4FirstDns : okhttp3.Dns {
    override fun lookup(hostname: String): List<java.net.InetAddress> {
        val addresses = okhttp3.Dns.SYSTEM.lookup(hostname)
        return addresses.filterIsInstance<java.net.Inet4Address>() + addresses.filterNot { it is java.net.Inet4Address }
    }
}

internal val httpClient by lazy {
    HttpClient(OkHttp) {
        engine { config { dns(Ipv4FirstDns) } }
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

internal suspend fun HttpClient.getWithETag(
    url: String,
    etag: String?,
    timeoutMillis: Long? = null,
): ETagFetchResult {
    val response = get(url) {
        etag?.let { headers.append(HttpHeaders.IfNoneMatch, it) }
        timeoutMillis?.let { timeout { requestTimeoutMillis = it } }
    }

    return when (response.status) {
        HttpStatusCode.OK -> ETagFetchResult.Fetched(
            bytes = response.body(),
            etag = response.headers[HttpHeaders.ETag]?.takeIf { it.isNotEmpty() },
        )

        HttpStatusCode.NotModified -> ETagFetchResult.NotModified

        else -> throw ResponseException(response, "Received status: ${response.status}")
    }
}