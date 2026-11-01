// Copyright (c) 2026 rootpoi and contributors
package app.revenge.manager.installer.util

import android.os.Build
import com.android.apksig.ApkVerifier
import java.io.File
import java.security.MessageDigest

/**
 * Discord's APKs come from mirrors the installer doesn't run, and are signed again before they're installed: their own
 * signature is the only thing that says they're Discord's. Every downloaded one is checked here before it's patched.
 */
object ApkSignature {
    /** SHA-256 of the certificate Discord signs its app with, on every channel (CN=Jason Citron, O=Hammer and Chisel) */
    private val DISCORD_CERTIFICATES = setOf("3c39d23cf9367849a5c699395647fe0e5bfea5a1f1f40d8c717ddc70f8bfa113")

    /** Throws unless [apk] carries a valid APK signature (v2 or v3) by Discord */
    fun requireDiscord(apk: File) {
        val result = ApkVerifier.Builder(apk)
            // As installed on this Android, which takes v2 signatures: a split APK has no uses-sdk to read a minimum from
            .setMinCheckedPlatformVersion(Build.VERSION.SDK_INT)
            .build()
            .verify()
        if (!result.isVerified) {
            throw SecurityException("${apk.name} isn't validly signed: ${result.allErrors.joinToString("; ")}")
        }

        val certificates = result.signerCertificates.map { sha256Hex(it.encoded) }
        if (certificates.none { it in DISCORD_CERTIFICATES }) {
            throw SecurityException("${apk.name} isn't signed by Discord (signed by ${certificates.joinToString()})")
        }
    }

    private fun sha256Hex(bytes: ByteArray) =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
