// Copyright (c) 2026 rootpoi and contributors
package app.revenge.manager.utils

/** major, minor and patch of a version name like "1.0.3", "v1.0.3" or "1.0.3-beta", or null when it isn't one */
internal fun versionParts(name: String): List<Int>? {
    val parts = name.trim().removePrefix("v").substringBefore("-").split(".")
    if (parts.size !in 1..3) return null
    val numbers = parts.map { part -> part.toIntOrNull()?.takeIf { it >= 0 } ?: return null }
    return numbers + List(3 - numbers.size) { 0 }
}

/**
 * Whether the installer release named [candidate] is newer than the running one, [current]. Only a newer release is
 * offered as an update: an older one, like a release made after a later build was installed by hand, isn't, nor one
 * whose name isn't a version.
 */
internal fun isNewerVersion(candidate: String, current: String): Boolean {
    val a = versionParts(candidate) ?: return false
    val b = versionParts(current) ?: return false
    for (i in 0 until 3) {
        if (a[i] != b[i]) return a[i] > b[i]
    }
    return false
}
