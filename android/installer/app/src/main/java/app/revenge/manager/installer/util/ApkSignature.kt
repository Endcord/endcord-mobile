// Copyright (c) 2026 rootpoi and contributors
package app.revenge.manager.installer.util

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import com.android.apksig.ApkVerifier
import java.io.File
import java.security.MessageDigest

/**
 * Discord's APKs come from mirrors the installer doesn't run, and are signed again before they're installed: their own
 * signature is the only thing that says they're Discord's. Every downloaded one is checked here before it's patched.
 * The installer's own updates are checked the same way before they're installed.
 */
object ApkSignature {
    /** SHA-256 of the certificate Discord signs its app with, on every channel (CN=Jason Citron, O=Hammer and Chisel) */
    private val DISCORD_CERTIFICATES = setOf("3c39d23cf9367849a5c699395647fe0e5bfea5a1f1f40d8c717ddc70f8bfa113")

    /** Throws unless [apk] carries a valid APK signature (v2 or v3) by Discord */
    fun requireDiscord(apk: File) {
        val certificates = verifiedCertificates(apk)
        if (certificates.none { it in DISCORD_CERTIFICATES }) {
            throw SecurityException("${apk.name} isn't signed by Discord (signed by ${certificates.joinToString()})")
        }
    }

    /**
     * Throws unless [apk] is an update of this app: the same package, validly signed with a certificate this app is
     * signed with. Android checks as much for an update it installs itself, but a different package would be offered as
     * a new app, and Shizuku's `pm install` takes any package.
     */
    fun requireUpdateOf(context: Context, apk: File) {
        val archive = context.packageManager.getPackageArchiveInfo(apk.absolutePath, 0)
            ?: throw SecurityException("${apk.name} isn't an APK")
        if (archive.packageName != context.packageName) {
            throw SecurityException("${apk.name} is ${archive.packageName}, not an update of ${context.packageName}")
        }

        val own = ownCertificates(context)
        val certificates = verifiedCertificates(apk)
        if (certificates.none { it in own }) {
            throw SecurityException("${apk.name} isn't signed with this app's key (signed by ${certificates.joinToString()})")
        }
    }

    /** SHA-256 of the certificates of [apk]'s valid APK signature (v2 or v3); throws when it has none */
    private fun verifiedCertificates(apk: File): List<String> {
        val result = ApkVerifier.Builder(apk)
            // As installed on this Android, which takes v2 signatures: a split APK has no uses-sdk to read a minimum from
            .setMinCheckedPlatformVersion(Build.VERSION.SDK_INT)
            .build()
            .verify()
        if (!result.isVerified) {
            throw SecurityException("${apk.name} isn't validly signed: ${result.allErrors.joinToString("; ")}")
        }
        return result.signerCertificates.map { sha256Hex(it.encoded) }
    }

    /** SHA-256 of the certificates this app is signed with */
    @Suppress("DEPRECATION")
    private fun ownCertificates(context: Context): Set<String> {
        val signing = context.packageManager
            .getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            .signingInfo ?: return emptySet()
        val signers = if (signing.hasMultipleSigners()) signing.apkContentsSigners else signing.signingCertificateHistory
        return signers.mapTo(HashSet()) { sha256Hex(it.toByteArray()) }
    }

    private fun sha256Hex(bytes: ByteArray) =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
