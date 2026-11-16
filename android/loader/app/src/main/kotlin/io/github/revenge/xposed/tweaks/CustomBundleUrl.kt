package io.github.revenge.xposed.tweaks

import io.github.revenge.xposed.RevengeJson
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Whether the custom bundle link in the loader config is the one in use right now: it's on (and a link [RevengeUpdater]
 * may fetch from), and either the app Endcord runs in is a developer's own build ([debuggable]) or the user allowed it
 * in this process, in the loader's own dialog ([approved]).
 *
 * A plugin can write the loader config, as Discord's file module reaches it, so the config alone never decides it: it
 * can't press a native dialog's buttons, nor change what this process remembers. The answer is never stored on disk.
 */
internal fun customUrlInUse(enabled: Boolean, debuggable: Boolean, approved: Boolean): Boolean =
    enabled && (debuggable || approved)

/** Where the saved bundle was fetched from, and its ETag when the server gave one */
internal data class SavedSource(val url: String, val etag: String?)

/**
 * Reads the file kept beside the saved bundle: the link it was fetched from and its ETag on two lines, or the link alone
 * when there was no ETag. One line that isn't a link is the older form, an ETag of [defaultUrl]. ETags are quoted
 * strings (`"…"` or `W/"…"`), never a link.
 */
internal fun parseSavedSource(text: String, defaultUrl: String): SavedSource? {
    val lines = text.lines().map { it.trim() }.filter { it.isNotEmpty() }
    return when {
        lines.size == 1 && isLink(lines[0]) -> SavedSource(lines[0], null)
        lines.size == 1 -> SavedSource(defaultUrl, lines[0])
        lines.size == 2 -> SavedSource(lines[0], lines[1])
        else -> null
    }
}

/** What [parseSavedSource] reads back */
internal fun savedSourceText(url: String, etag: String?): String = if (etag != null) "$url\n$etag" else url

private fun isLink(line: String) = line.startsWith("https://", ignoreCase = true) || line.startsWith("http://", ignoreCase = true)

private val PUBLISHED_BYTECODE_NAME = Regex("""endcord\.v\d+\.hbc""")

/**
 * Whether [url] is one the published bundle is fetched from ([RevengeUpdater]'s bundle URLs): [defaultUrl] itself, or
 * the bundle precompiled for a Hermes version beside it.
 */
internal fun isPublishedBundleUrl(url: String, defaultUrl: String): Boolean {
    if (url == defaultUrl) return true
    val folder = defaultUrl.substringBeforeLast('/') + "/"
    return url.startsWith(folder) && PUBLISHED_BYTECODE_NAME.matches(url.removePrefix(folder))
}

/**
 * Whether the saved bundle may run as the published one, by where it was fetched from ([source], null when that isn't
 * known): never one from anywhere else, like a custom link. While a custom link waits for the user's answer, not one
 * from an unknown place either: one saved from the link by an older loader, without an ETag, left no link behind. The
 * published bundle is fetched again instead.
 */
internal fun savedBundleMayRunAsPublished(source: String?, customUrlWaiting: Boolean, isPublished: (String) -> Boolean): Boolean =
    if (source == null) !customUrlWaiting else isPublished(source)

/**
 * The loader config [json] with the custom bundle link turned off, and everything else in it as it was (fields this
 * loader doesn't know included). A config that can't be read becomes one with only that.
 */
internal fun configWithCustomUrlOff(json: String?): String {
    val root = json?.let { runCatching { RevengeJson.parseToJsonElement(it) as? JsonObject }.getOrNull() } ?: JsonObject(emptyMap())
    val custom = root["customLoadUrl"] as? JsonObject ?: JsonObject(emptyMap())
    return JsonObject(root + ("customLoadUrl" to JsonObject(custom + ("enabled" to JsonPrimitive(false))))).toString()
}
