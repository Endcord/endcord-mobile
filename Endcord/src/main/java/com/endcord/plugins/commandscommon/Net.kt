/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.commandscommon

import com.aliucord.Http
import com.aliucord.utils.IOUtils
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.URLEncoder

/** Small blocking HTTP helpers for slash commands. Commands already run off the main thread. */
internal object Net {
    private const val TIMEOUT_MS = 15_000

    /** A request that failed with an HTTP error, carrying the status and the server's error message if it sent one. */
    class HttpError(val status: Int, val serverMessage: String?) : IOException("HTTP $status${serverMessage?.let { ": $it" } ?: ""}")

    /** Runs [request] and returns its body, throwing [HttpError] for non 2xx responses. */
    @JvmStatic
    fun text(request: Http.Request, body: String? = null): String {
        try {
            request.setRequestTimeout(TIMEOUT_MS)
            val res = if (body == null) request.execute() else {
                request.setHeader("Content-Type", "application/json").executeWithBody(body)
            }
            if (!res.ok()) throw HttpError(res.statusCode, readErrorMessage(request))
            return res.text()
        } finally {
            request.close()
        }
    }

    @JvmStatic
    fun getText(url: String): String = text(Http.Request(url).setHeader("Accept", "application/json"))

    @JvmStatic
    fun getObject(url: String): JSONObject = JSONObject(getText(url))

    @JvmStatic
    fun getArray(url: String): JSONArray = JSONArray(getText(url))

    /** Downloads [url] into memory, refusing anything larger than [maxBytes]. */
    @JvmStatic
    fun getBytes(url: String, maxBytes: Int = 16 * 1024 * 1024): ByteArray {
        val request = Http.Request(url).setRequestTimeout(TIMEOUT_MS)
        try {
            val res = request.execute()
            if (!res.ok()) throw HttpError(res.statusCode, null)
            val length = request.conn.contentLengthLong
            if (length > maxBytes) throw IOException("File is too large")
            val bytes = res.getBytes()
            if (bytes.size > maxBytes) throw IOException("File is too large")
            return bytes
        } finally {
            request.close()
        }
    }

    /** Pulls `message` out of a Discord style JSON error body, or the raw body when it isn't JSON. */
    private fun readErrorMessage(request: Http.Request): String? = try {
        val raw = request.conn.errorStream?.use { IOUtils.readAsText(it) }?.trim()
        if (raw.isNullOrEmpty()) null else try {
            JSONObject(raw).optString("message").takeIf { it.isNotEmpty() } ?: raw.take(200)
        } catch (_: Throwable) {
            raw.take(200)
        }
    } catch (_: Throwable) {
        null
    }

    /** The same escaping as JavaScript's `encodeURIComponent`. */
    @JvmStatic
    fun encodeURIComponent(s: String): String = URLEncoder.encode(s, "UTF-8")
        .replace("+", "%20")
        .replace("%21", "!")
        .replace("%27", "'")
        .replace("%28", "(")
        .replace("%29", ")")
        .replace("%7E", "~")

    /** A short, readable reason for a failed request, for showing to the user. */
    @JvmStatic
    fun describe(e: Throwable): String = when (e) {
        is HttpError -> e.serverMessage ?: "HTTP ${e.status}"
        else -> e.message ?: e.javaClass.simpleName
    }
}
