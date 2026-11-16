package io.github.revenge.xposed.tweaks

import android.util.Base64
import io.github.revenge.xposed.BuildConfig
import io.github.revenge.xposed.RevengeJson
import kotlinx.serialization.Serializable
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

@Serializable
private data class ReleaseManifest(
    val format: Int,
    val sequence: Long,
    val files: Map<String, ReleaseFile>,
)

@Serializable
private data class ReleaseFile(val size: Long, val sha256: String, val url: String? = null)

/**
 * A published bundle's endcord-release.json, once its signature is checked against the public key the loader is built
 * with (bundle/scripts/sign-release.mjs writes both). The server only stores it: it can't change what a release says.
 */
class BundleRelease private constructor(
    val sequence: Long,
    /** Size and SHA-256 of each file, by its name */
    private val files: Map<String, String>,
    private val pinnedUrls: Map<String, String>,
) {
    /**
     * Whether [bytes] are the file this release lists as [name], by size and SHA-256. Only under that name: a release
     * also lists the installers and the loader's own APK, which mustn't pass for the bundle when served in its place.
     */
    fun lists(name: String, bytes: ByteArray) = files[name] == "${bytes.size}:${sha256(bytes)}"

    /** The address of a bundle of this release that never changes, unlike the branch's, which the CDN caches */
    fun pinnedUrlOf(name: String) = pinnedUrls[name]

    companion object {
        private const val FORMAT = 1

        /** Null unless the signature is valid and the manifest is one this loader can read */
        fun parse(manifest: ByteArray, signature: ByteArray): BundleRelease? = runCatching {
            val key = KeyFactory.getInstance("EC").generatePublic(
                X509EncodedKeySpec(Base64.decode(BuildConfig.RELEASE_KEY, Base64.DEFAULT))
            )
            val valid = Signature.getInstance("SHA256withECDSA").run {
                initVerify(key)
                update(manifest)
                verify(signature)
            }
            if (!valid) return null
            ofVerifiedManifest(manifest)
        }.getOrNull()

        /** What a manifest whose signature [parse] checked says; on its own only for the tests, which have no key */
        internal fun ofVerifiedManifest(manifest: ByteArray): BundleRelease? = runCatching {
            val parsed = RevengeJson.decodeFromString<ReleaseManifest>(manifest.decodeToString())
            if (parsed.format != FORMAT) return null
            BundleRelease(
                parsed.sequence,
                parsed.files.mapValues { (_, file) -> "${file.size}:${file.sha256.lowercase()}" },
                parsed.files.mapNotNull { (name, file) -> file.url?.let { name to it } }.toMap(),
            )
        }.getOrNull()

        private fun sha256(bytes: ByteArray) =
            MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    }
}
