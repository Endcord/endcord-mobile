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
private data class ReleaseFile(val size: Long, val sha256: String)

/**
 * A published bundle's endcord-release.json, once its signature is checked against the public key the loader is built
 * with (bundle/scripts/sign-release.mjs writes both). The server only stores it: it can't change what a release says.
 */
class BundleRelease private constructor(val sequence: Long, private val bundles: Set<String>) {
    /** Whether a bundle is one this release lists, by size and SHA-256 */
    operator fun contains(bundle: ByteArray) = "${bundle.size}:${sha256(bundle)}" in bundles

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

            val parsed = RevengeJson.decodeFromString<ReleaseManifest>(manifest.decodeToString())
            if (parsed.format != FORMAT) return null
            BundleRelease(parsed.sequence, parsed.files.values.mapTo(HashSet()) { "${it.size}:${it.sha256.lowercase()}" })
        }.getOrNull()

        private fun sha256(bytes: ByteArray) =
            MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    }
}
