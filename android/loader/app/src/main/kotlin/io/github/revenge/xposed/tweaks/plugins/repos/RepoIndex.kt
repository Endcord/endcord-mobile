package io.github.revenge.xposed.tweaks.plugins.repos

import io.github.revenge.Logger
import io.github.revenge.plugins.Version
import io.github.revenge.plugins.VersionRange
import io.github.revenge.xposed.RevengeJson
import io.github.revenge.xposed.OWN_MACHINE_HOSTS
import io.github.revenge.xposed.isPrivateAddress
import io.github.revenge.xposed.tweaks.plugins.external.ExternalDependency
import io.github.revenge.xposed.tweaks.plugins.external.requireValidPluginId
import io.github.revenge.xposed.tweaks.plugins.external.validatedPluginIcon
import kotlinx.serialization.Serializable

/** The supported repository index format version. */
internal const val REPO_INDEX_FORMAT = 1

// The URL is its identity.
@Serializable
internal data class RepoIndex(
    /** Only [REPO_INDEX_FORMAT] is accepted. */
    val format: Int,
    val name: String,
    val description: String = "",
    /** A Discord asset name or a `data:` URL. */
    val icon: String? = null,
    /** Plugins keyed by plugin ID. */
    val plugins: Map<String, RepoPlugin> = emptyMap(),
)

@Serializable
internal data class RepoPlugin(
    val name: String,
    val description: String = "",
    val author: String = "",
    val contributors: List<String> = emptyList(),
    /** A Discord asset name or a `data:` URL. */
    val icon: String? = null,
    /**
     * Channel pointers (e.g. `latest`, `testing`), each naming a key of [versions].
     *
     * `latest` is the default install/update channel.
     */
    val channels: Map<String, String> = emptyMap(),
    /** Published versions keyed by their exact version string. */
    val versions: Map<String, RepoVersion> = emptyMap(),
)

/** A published plugin version. */
@Serializable
internal data class RepoVersion(
    /** Absolute URL of the plugin ZIP artifact. */
    val url: String,
    /** Lowercase hex SHA-256 digest of the artifact. */
    val sha256: String,
    /** Artifact size in bytes. */
    val size: Long,
    /**
     * The version's dependencies as they appear in its manifest.
     *
     * Used for client-side resolution before download.
     * Any mismatch between the index and the artifact's manifest aborts the install.
     */
    val dependencies: Map<String, ExternalDependency> = emptyMap(),
)

/** The default channel used for installs and update checks. */
internal const val REPO_CHANNEL_LATEST = "latest"

private val SHA256_HEX_REGEX = Regex("^[0-9a-f]{64}$")

/** Plain http from the developer's own machine only: localhost, and 10.0.2.2, the machine as the emulator sees it */
private val OWN_MACHINE_HTTP = Regex("^http://(localhost|127\\.0\\.0\\.1|\\[::1]|10\\.0\\.2\\.2)(:\\d+)?(/|$)", RegexOption.IGNORE_CASE)

/**
 * Whether a repository, or a plugin artifact, may be fetched from [url]: over https, or over plain http from this
 * machine, as the bundle requires of its addons (lib/utils/addonUrl.ts). An index names the artifacts and their
 * digests, and an artifact is code that runs in Discord: whoever could change them on the way, like anyone on the same
 * Wi-Fi with plain http, mustn't be able to.
 */
internal fun isRepoUrl(url: String): Boolean =
    (url.startsWith("https://", ignoreCase = true) && !hasPrivateLiteralHost(url)) || OWN_MACHINE_HTTP.containsMatchIn(url)

private val IPV4_LITERAL = Regex("""^\d{1,3}(\.\d{1,3}){3}$""")

/**
 * Whether an https link names an address on this device or its network outright, as Endcord PC refuses: addresses
 * written in a link never reach the DNS check that names get (HTTP.kt). Names are left to that check; this one never
 * looks anything up.
 */
internal fun hasPrivateLiteralHost(url: String): Boolean {
    // java.net.URI sees no host at all in "https://127.0.0.1./", which OkHttp still connects to: the host as written then
    val host = runCatching { java.net.URI(url).host }.getOrNull() ?: writtenHost(url) ?: return false
    // A trailing dot names the same address ("127.0.0.1." is 127.0.0.1)
    val bare = host.removePrefix("[").removeSuffix("]").trimEnd('.')
    if (!IPV4_LITERAL.matches(bare) && ':' !in bare) return false
    return runCatching { isPrivateAddress(java.net.InetAddress.getByName(bare)) }.getOrDefault(true)
}

/** The host part of a link as written: after the scheme and any user info, before the port, path, query or fragment */
private fun writtenHost(url: String): String? {
    val authority = url.substringAfter("://", "").takeWhile { it !in "/\\?#" }.substringAfterLast('@')
    val host = if (authority.startsWith("[")) authority.substringBefore(']') + "]" else authority.substringBefore(':')
    return host.takeIf { it.isNotEmpty() }
}

internal const val REPO_URL_RULE = "must be an https:// link (plain http:// only from this machine)"

/**
 * Whether a link goes to this machine, as the connection check in HTTP.kt lets it ([OWN_MACHINE_HOSTS]): null when
 * it can't be read
 */
private fun goesToThisMachine(url: String): Boolean? {
    if (OWN_MACHINE_HTTP.containsMatchIn(url)) return true
    val host = runCatching { io.ktor.http.Url(url).host }.getOrNull() ?: return null
    return host.lowercase().removePrefix("[").removeSuffix("]").removeSuffix(".") in OWN_MACHINE_HOSTS
}

/**
 * Whether a repository at [repoUrl] may name an artifact at [url]: a link [isRepoUrl] allows, and one on this machine
 * only for a repository on this machine itself, a developer's own. Otherwise any https repository could have the
 * phone fetch a path of its choosing from a service on this machine (http://127.0.0.1:port/...). An artifact link that
 * can't be read counts as on this machine; a repository link that can't be read, as not.
 */
internal fun isRepoArtifactUrl(url: String, repoUrl: String): Boolean =
    isRepoUrl(url) && (goesToThisMachine(url) == false || goesToThisMachine(repoUrl) == true)

internal const val REPO_ARTIFACT_URL_RULE = "must be an https:// link (one on this machine only from a repository on this machine)"

/**
 * Parses and sanitizes a repository index document.
 *
 * Throws on unparseable JSON, an unsupported [RepoIndex.format], with these extra rules:
 * - Icons that aren't asset names or data URLs are stripped (see [validatedPluginIcon]).
 * - Structurally invalid versions (bad version format, a [RepoVersion.url] that isn't https (see [isRepoArtifactUrl]),
 *   malformed [RepoVersion.sha256], non-positive size, invalid dependency IDs/ranges) are dropped with a warning.
 * - Channel pointers naming a missing/dropped version are dropped with a warning.
 * - Plugins with an invalid ID or no remaining versions are dropped with a warning.
 */
internal fun parseRepoIndex(json: String, repoUrl: String, log: Logger): RepoIndex {
    val raw = RevengeJson.decodeFromString<RepoIndex>(json)
    require(raw.format == REPO_INDEX_FORMAT) {
        "Repository '$repoUrl' has unsupported index format ${raw.format} (supported: $REPO_INDEX_FORMAT)"
    }

    fun warn(message: String) = log.w("Repository '$repoUrl': $message")

    val plugins = buildMap {
        for ((id, plugin) in raw.plugins) {
            try {
                requireValidPluginId(id)
            } catch (e: IllegalArgumentException) {
                warn("dropped plugin entry '$id': ${e.message}")
                continue
            }

            val versions = buildMap {
                for ((versionKey, version) in plugin.versions) {
                    val problem = validateRepoVersion(versionKey, version, repoUrl)
                    if (problem != null) {
                        warn("dropped version '$id@$versionKey': $problem")
                        continue
                    }
                    put(versionKey, version)
                }
            }
            if (versions.isEmpty()) {
                warn("dropped plugin entry '$id': no valid versions")
                continue
            }

            val channels = buildMap {
                for ((channel, target) in plugin.channels) {
                    if (target !in versions) {
                        warn("dropped channel '$id/$channel': it points to missing version '$target'")
                        continue
                    }
                    put(channel, target)
                }
            }

            put(
                id,
                plugin.copy(icon = plugin.icon?.let(::validatedPluginIcon), channels = channels, versions = versions)
            )
        }
    }

    return raw.copy(icon = raw.icon?.let(::validatedPluginIcon), plugins = plugins)
}

/** Returns a human-readable problem description, or `null` if the version entry is valid. */
private fun validateRepoVersion(versionKey: String, version: RepoVersion, repoUrl: String): String? {
    try {
        Version.parse(versionKey)
    } catch (e: IllegalArgumentException) {
        return "invalid version string: ${e.message}"
    }
    if (!isRepoArtifactUrl(version.url, repoUrl)) return "url $REPO_ARTIFACT_URL_RULE: '${version.url}'"
    if (!SHA256_HEX_REGEX.matches(version.sha256)) return "malformed sha256 digest"
    if (version.size <= 0) return "non-positive size"
    for ((depId, dep) in version.dependencies) {
        try {
            requireValidPluginId(depId)
            dep.version?.let(VersionRange::parse)
        } catch (e: IllegalArgumentException) {
            return "invalid dependency '$depId': ${e.message}"
        }
    }
    return null
}
