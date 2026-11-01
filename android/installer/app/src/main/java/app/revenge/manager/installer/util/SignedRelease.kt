// Copyright (c) 2026 rootpoi and contributors
package app.revenge.manager.installer.util

import android.util.Base64
import app.revenge.manager.BuildConfig
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
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
 * A published build's endcord-release.json, once its signature is checked against the key the installer is built with
 * (bundle/scripts/sign-release.mjs writes it; the loaders check their bundle with it the same way). It lists the loader
 * and the installers by size and SHA-256, so the server only stores them: whoever can change the files there can't make
 * the installer take them, or an older signed build again.
 */
class SignedRelease private constructor(
    val sequence: Long,
    private val files: Map<String, ReleaseFile>,
) {
    /** The address of a file of this release that never changes, unlike the branch's, which the CDN caches for a while */
    fun pinnedUrlOf(name: String): String? = files[name]?.url

    /** Throws unless [file] is the one this release lists as [name], by size and SHA-256 */
    fun require(name: String, file: File) {
        val listed = files[name] ?: throw SecurityException("The signed release doesn't list $name")
        if (file.length() != listed.size) {
            throw SecurityException("$name is ${file.length()} bytes; the signed release says ${listed.size}")
        }
        val digest = sha256Hex(file)
        if (digest != listed.sha256.lowercase()) throw SecurityException("$name isn't the signed release's ($digest)")
    }

    companion object {
        private const val FORMAT = 1
        private const val MANIFEST = "endcord-release.json"
        private const val SIGNATURE = "endcord-release.sig"
        private val json = Json { ignoreUnknownKeys = true }

        /** Null unless the signature is valid and the manifest is one this installer can read */
        fun parse(manifest: ByteArray, signature: ByteArray): SignedRelease? = runCatching {
            val key = KeyFactory.getInstance("EC").generatePublic(
                X509EncodedKeySpec(Base64.decode(BuildConfig.RELEASE_KEY, Base64.DEFAULT))
            )
            val valid = Signature.getInstance("SHA256withECDSA").run {
                initVerify(key)
                update(manifest)
                verify(signature)
            }
            if (!valid) return null

            val parsed = json.decodeFromString<ReleaseManifest>(manifest.decodeToString())
            if (parsed.format != FORMAT) return null
            SignedRelease(parsed.sequence, parsed.files)
        }.getOrNull()

        /**
         * The release published next to [fileUrl]; throws when there's none, its signature isn't valid, or it's older
         * than [acceptedSequence], the newest this installer took before
         */
        suspend fun fetch(http: HttpClient, fileUrl: String, acceptedSequence: Long): SignedRelease {
            val folder = fileUrl.substringBeforeLast('/')
            val manifest = http.download("$folder/$MANIFEST")
            val signature = http.download("$folder/$SIGNATURE")
            if (manifest == null || signature == null) throw SecurityException("No signed release could be fetched from $folder")

            val release = parse(manifest, signature) ?: throw SecurityException("The release's signature isn't valid")
            if (release.sequence < acceptedSequence) throw SecurityException("The release is older than one already installed")
            return release
        }

        /** The body of a URL as the server has it now, or null when it answers with anything but 200 */
        private suspend fun HttpClient.download(url: String): ByteArray? {
            // The query defeats the CDN's cache, which could hold the manifest and the signature of two different builds
            val response = get(url) { parameter("t", System.currentTimeMillis() / 60_000) }
            return if (response.status == HttpStatusCode.OK) response.body<ByteArray>() else null
        }

        private fun sha256Hex(file: File): String {
            val digest = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input ->
                val buffer = ByteArray(1 shl 16)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    digest.update(buffer, 0, read)
                }
            }
            return digest.digest().joinToString("") { "%02x".format(it) }
        }
    }
}
