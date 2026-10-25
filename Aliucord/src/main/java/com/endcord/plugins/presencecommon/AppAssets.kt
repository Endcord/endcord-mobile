/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.presencecommon

import android.os.Looper
import com.aliucord.Http
import com.aliucord.Logger
import org.json.JSONArray
import org.json.JSONObject

/**
 * Turns the image of a rich presence into what the gateway expects, like Discord's `ApplicationAssetUtils`:
 * an image link becomes a media proxy path (`mp:external/...`) through the application's external assets, and
 * any other text is looked up by name in the assets uploaded to the application.
 *
 * Every call does network requests: only call it from a background thread.
 */
internal object AppAssets {
    private val logger = Logger("Endcord/AppAssets")

    private const val ASSET_LIST_TTL_MS = 60 * 60 * 1000L
    private const val MAX_CACHED_URLS = 64

    /** "appId|url" -> "mp:external/..." */
    private val external = object : LinkedHashMap<String, String>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?) = size > MAX_CACHED_URLS
    }

    private class AssetList(val fetchedAt: Long, val ids: Map<String, String>)

    /** appId -> the names and ids of the assets uploaded to it */
    private val assetLists = HashMap<Long, AssetList>()

    fun isUrl(key: String) = key.startsWith("https://") || key.startsWith("http://")

    /** The value to put in `large_image`/`small_image` for [key], or null when it can't be resolved. */
    fun resolve(appId: Long, key: String?): String? {
        if (key.isNullOrBlank()) return null
        val trimmed = key.trim()
        if (Looper.myLooper() == Looper.getMainLooper()) {
            logger.error("AppAssets.resolve called on the main thread", null)
            return null
        }
        if (trimmed.startsWith("mp:") || trimmed.startsWith("spotify:")) return trimmed
        return try {
            if (isUrl(trimmed)) resolveUrl(appId, trimmed) else resolveName(appId, trimmed)
        } catch (e: Throwable) {
            logger.error("Failed to resolve the rich presence image $trimmed", e)
            null
        }
    }

    private fun resolveUrl(appId: Long, url: String): String? {
        val cacheKey = "$appId|$url"
        synchronized(external) { external[cacheKey] }?.let { return it.ifEmpty { null } }
        // A failure is remembered too ("" = known miss), so a poll doesn't post the same link again every time
        val value = try {
            val body = JSONObject().put("urls", JSONArray().put(url)).toString()
            val res = Http.Request.newDiscordRNRequest("/applications/$appId/external-assets", "POST")
                .setHeader("Content-Type", "application/json")
                .executeWithBody(body)
            res.assertOk()
            val list = JSONArray(res.text())
            val path = list.optJSONObject(0)?.optString("external_asset_path").orEmpty()
            if (path.isEmpty()) "" else "mp:$path"
        } catch (e: Throwable) {
            logger.error("Failed to resolve $url", e)
            ""
        }
        synchronized(external) { external[cacheKey] = value }
        return value.ifEmpty { null }
    }

    private fun resolveName(appId: Long, name: String): String? {
        val now = System.currentTimeMillis()
        val cached = synchronized(assetLists) { assetLists[appId] }
        val names = if (cached != null && now - cached.fetchedAt < ASSET_LIST_TTL_MS) cached.ids else {
            val res = Http.Request.newDiscordRNRequest("/oauth2/applications/$appId/assets").execute()
            res.assertOk()
            val list = JSONArray(res.text())
            val map = HashMap<String, String>()
            for (i in 0 until list.length()) {
                val asset = list.optJSONObject(i) ?: continue
                map[asset.optString("name")] = asset.optString("id")
            }
            synchronized(assetLists) { assetLists[appId] = AssetList(now, map) }
            map
        }
        return names[name]
    }

    /** Forgets the asset list of [appId], after the user changed which application to use. */
    fun invalidate(appId: Long) {
        synchronized(assetLists) { assetLists.remove(appId) }
    }
}
