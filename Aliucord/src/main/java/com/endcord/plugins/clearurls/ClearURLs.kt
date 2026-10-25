/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.clearurls

import android.content.Context
import com.aliucord.Http
import com.aliucord.Utils
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.api.OutgoingMessages
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URLDecoder
import java.util.regex.Pattern

internal class ClearURLs : ComposerPlugin(
    name = "ClearURLs",
    description = "Automatically removes tracking elements from URLs you send",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("privacy", "utility")

    private class Provider(
        val urlPattern: Pattern,
        val rules: List<Pattern>,
        val rawRules: List<Pattern>,
        val exceptions: List<Pattern>,
    )

    /** Compiled ClearURLs providers, replaced as a whole when the rules are (re)loaded. */
    @Volatile
    private var providers: List<Provider> = emptyList()

    @Volatile
    private var running = false

    override fun start(context: Context) {
        running = true
        val cache = File(context.filesDir, CACHE_FILE)
        Utils.threadPool.execute { loadRules(cache) }

        onOutgoing(OutgoingMessages.Priority.SANITIZE, onSend = true, onEdit = true) { message ->
            message.content = clean(message.content)
        }
    }

    override fun stop(context: Context) {
        running = false
        providers = emptyList()
        super.stop(context)
    }

    /** Uses the cached rules right away and downloads fresh ones when the cache is a day old. */
    private fun loadRules(cache: File) {
        try {
            if (cache.exists()) {
                val compiled = compile(cache.readText())
                if (running) providers = compiled
            }
            if (cache.exists() && System.currentTimeMillis() - cache.lastModified() < REFRESH_MS) return

            val json = Http.simpleGet(RULES_URL)
            val compiled = compile(json)
            if (compiled.isEmpty()) return
            cache.parentFile?.mkdirs()
            cache.writeText(json)
            if (running) providers = compiled
        } catch (e: Throwable) {
            logger.error("Failed to load the ClearURLs rules", e)
        }
    }

    private fun compile(json: String): List<Provider> {
        val all = JSONObject(json).optJSONObject("providers") ?: return emptyList()
        val result = ArrayList<Provider>(all.length())
        val names = all.keys()
        while (names.hasNext()) {
            val provider = all.optJSONObject(names.next()) ?: continue
            val urlPattern = regex(provider.optString("urlPattern", "")) ?: continue
            result += Provider(
                urlPattern = urlPattern,
                // Rules name whole query parameters, like the ClearURLs extension applies them
                rules = patterns(provider.optJSONArray("rules")) { "^(?:$it)$" },
                rawRules = patterns(provider.optJSONArray("rawRules")) { it },
                exceptions = patterns(provider.optJSONArray("exceptions")) { it },
            )
        }
        return result
    }

    private inline fun patterns(array: JSONArray?, wrap: (String) -> String): List<Pattern> {
        if (array == null) return emptyList()
        val result = ArrayList<Pattern>(array.length())
        for (i in 0 until array.length()) regex(wrap(array.optString(i, "")))?.let { result += it }
        return result
    }

    private fun regex(source: String): Pattern? = if (source.isEmpty()) null else try {
        Pattern.compile(source, Pattern.CASE_INSENSITIVE)
    } catch (e: Throwable) {
        null
    }

    private fun clean(content: String): String {
        val current = providers
        if (current.isEmpty() || !content.contains("http")) return content
        val matcher = URL_REGEX.matcher(content)
        if (!matcher.find()) return content

        val out = StringBuilder(content.length)
        var last = 0
        do {
            out.append(content, last, matcher.start())
            out.append(cleanUrl(matcher.group(), current))
            last = matcher.end()
        } while (matcher.find())
        out.append(content, last, content.length)
        return out.toString()
    }

    private fun cleanUrl(original: String, providers: List<Provider>): String {
        // Only links with query parameters can carry tracking parameters
        if (splitQuery(original).component2().isEmpty()) return original

        var url = original
        for (provider in providers) {
            if (!provider.urlPattern.matcher(url).find()) continue
            if (provider.exceptions.any { it.matcher(url).find() }) continue

            if (provider.rules.isNotEmpty()) {
                val (base, params, fragment) = splitQuery(url)
                val kept = params.filterNot { param ->
                    val name = decode(param.substringBefore('='))
                    provider.rules.any { it.matcher(name).matches() }
                }
                if (kept.size != params.size) url = base + (if (kept.isEmpty()) "" else "?" + kept.joinToString("&")) + fragment
            }
            for (raw in provider.rawRules) url = raw.matcher(url).replaceAll("")
        }
        return url
    }

    /** Splits a link into the part before the query, its parameters and the `#fragment`. */
    private fun splitQuery(url: String): Triple<String, List<String>, String> {
        val hashIndex = url.indexOf('#')
        val fragment = if (hashIndex >= 0) url.substring(hashIndex) else ""
        val beforeFragment = if (hashIndex >= 0) url.substring(0, hashIndex) else url
        val queryIndex = beforeFragment.indexOf('?')
        if (queryIndex < 0) return Triple(beforeFragment, emptyList(), fragment)
        val params = beforeFragment.substring(queryIndex + 1).split('&').filter { it.isNotEmpty() }
        return Triple(beforeFragment.substring(0, queryIndex), params, fragment)
    }

    private fun decode(value: String): String = try {
        URLDecoder.decode(value, "UTF-8")
    } catch (e: Throwable) {
        value
    }

    private companion object {
        const val RULES_URL = "https://raw.githubusercontent.com/ClearURLs/Rules/master/data.min.json"
        const val CACHE_FILE = "endcord/clearurls-rules.json"
        const val REFRESH_MS = 24 * 60 * 60 * 1000L
        val URL_REGEX: Pattern = Pattern.compile("https?://[^\\s<]+[^<.,:;\"'>)|\\]\\s]")
    }
}
