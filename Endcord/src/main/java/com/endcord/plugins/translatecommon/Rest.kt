/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.translatecommon

import com.aliucord.Http
import com.aliucord.utils.IOUtils
import com.endcord.plugins.commandscommon.Net
import org.json.JSONObject

/** Blocking calls to Discord's API that wait out rate limits instead of failing. Never call on the main thread. */
internal object Rest {
    private const val TIMEOUT_MS = 30_000
    private const val MAX_RETRIES = 5

    /**
     * Sends [method] [route] with an optional JSON [body] and returns the response text.
     * @throws Net.HttpError for error responses, carrying Discord's error message
     */
    @JvmStatic
    fun call(route: String, method: String = "GET", body: String? = null): String {
        var attempt = 0
        while (true) {
            val request = Http.Request.newDiscordRequest(route, method).setRequestTimeout(TIMEOUT_MS)
            try {
                val res = if (body == null) request.execute() else {
                    request.setHeader("Content-Type", "application/json").executeWithBody(body)
                }
                if (res.ok()) return res.text()

                val raw = try {
                    request.conn.errorStream?.use { IOUtils.readAsText(it) }
                } catch (_: Throwable) {
                    null
                }
                val json = try {
                    if (raw.isNullOrEmpty()) null else JSONObject(raw)
                } catch (_: Throwable) {
                    null
                }
                if (res.statusCode == 429 && attempt < MAX_RETRIES) {
                    attempt++
                    val retryAfter = json?.optDouble("retry_after", 1.0) ?: 1.0
                    Thread.sleep((retryAfter.coerceIn(0.1, 60.0) * 1000).toLong() + 250)
                    continue
                }
                throw Net.HttpError(res.statusCode, json?.optString("message")?.takeIf { it.isNotEmpty() } ?: raw?.take(200))
            } finally {
                request.close()
            }
        }
    }
}
