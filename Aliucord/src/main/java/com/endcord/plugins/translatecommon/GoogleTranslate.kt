/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.translatecommon

import com.aliucord.Http
import com.aliucord.i18n.tr
import com.aliucord.utils.IOUtils
import org.json.JSONObject
import java.io.IOException
import java.util.Locale

/**
 * The free Google Translate endpoint Endcord PC uses (`translate-pa.googleapis.com`, the `gtx` client).
 * Every call blocks, so only use it off the main thread.
 */
internal object GoogleTranslate {
    private const val ENDPOINT = "https://translate-pa.googleapis.com/v1/translate"

    // The public key of Google's own web client, the same one Endcord PC sends
    private const val KEY = "AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA"
    private const val TIMEOUT_MS = 15_000

    /** A finished translation. [confidence] is how sure Google is about [sourceLanguage], from 0 to 1. */
    class Result(@JvmField val text: String, @JvmField val sourceLanguage: String, @JvmField val confidence: Double)

    /** Google answered with an HTTP error. 429 means it is rate limiting us. */
    class HttpError(@JvmField val status: Int) : IOException("HTTP $status")

    /**
     * Translates [text] from [source] (a language code, or `auto` to detect it) to [target].
     * @throws IOException when Google can't be reached or refuses the request
     */
    @JvmStatic
    fun translate(text: String, source: String, target: String): Result {
        val query = Http.QueryBuilder(ENDPOINT)
            .append("params.client", "gtx")
            .append("dataTypes", "TRANSLATION")
            .append("key", KEY)
            .append("query.sourceLanguage", source)
            .append("query.targetLanguage", target)
            .append("query.text", text)
        val request = Http.Request(query).setRequestTimeout(TIMEOUT_MS).setHeader("Accept", "application/json")
        try {
            val res = request.execute()
            if (!res.ok()) {
                // Drain the error body so the connection can be reused
                try {
                    request.conn.errorStream?.use { IOUtils.readAsText(it) }
                } catch (_: Throwable) {
                }
                throw HttpError(res.statusCode)
            }
            val json = JSONObject(res.text())
            val translation = json.optString("translation")
            val detected = json.optString("sourceLanguage", source)
            val confidence = json.optJSONObject("detectedLanguages")
                ?.optJSONArray("srclangsConfidences")
                ?.optDouble(0, 1.0) ?: 1.0
            return Result(translation, detected, if (confidence.isNaN()) 1.0 else confidence)
        } finally {
            request.close()
        }
    }

    /** A short, translated reason for a failed translation, for showing to the user. */
    @JvmStatic
    fun describe(e: Throwable): String = when {
        e is HttpError && e.status == 429 -> tr("Google Translate is rate limiting you, try again in a minute")
        e is HttpError -> tr("Google Translate returned an error (HTTP {status})", "status" to e.status)
        e is java.net.UnknownHostException || e is java.net.SocketTimeoutException || e is java.net.ConnectException ->
            tr("Couldn't reach Google Translate, check your connection")
        else -> e.message ?: e.javaClass.simpleName
    }

    /** The Google language code closest to the device's language. */
    @JvmStatic
    fun deviceLanguage(): String {
        val locale = Locale.getDefault()
        return when (val lang = locale.language) {
            "zh" -> if (locale.country in setOf("TW", "HK", "MO") || locale.script == "Hant") "zh-TW" else "zh-CN"
            "he" -> "iw"
            "in" -> "id"
            "ji" -> "yi"
            "nb", "nn" -> "no"
            "fil" -> "tl"
            else -> if (Languages.names.containsKey(lang)) lang else "en"
        }
    }
}
