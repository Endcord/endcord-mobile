// Copyright (c) 2026 rootpoi and contributors
package app.revenge.manager.installer.util

import app.revenge.manager.utils.InstalledDiscord
import pxb.android.axml.AxmlReader
import pxb.android.axml.AxmlVisitor
import pxb.android.axml.NodeVisitor
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.zip.ZipFile

/**
 * What an APK's manifest says it is. Discord's signature only says an APK is one of Discord's, of any version: the
 * mirrors, or the app installed as Discord, could hand over an older Discord, or splits of different versions. Each
 * APK is held to the version and split it was asked for, too.
 */
object DiscordApkManifest {
    data class Info(val packageName: String?, val versionCode: Long?, val split: String?)

    /** A manifest is some hundred KiB; a bigger one is a zip made to fill the memory, not Discord's */
    private const val MAX_MANIFEST_BYTES = 8L shl 20

    /** Reads the package, version code and split name from the root of [apk]'s manifest */
    fun read(apk: File): Info {
        val bytes = ZipFile(apk).use { zip ->
            val entry = zip.getEntry("AndroidManifest.xml") ?: throw SecurityException("${apk.name} has no manifest")
            // Read in pieces up to the cap (InputStream.readNBytes is only on Android 13 and later)
            zip.getInputStream(entry).use { input ->
                val out = ByteArrayOutputStream()
                val buffer = ByteArray(1 shl 16)
                while (true) {
                    val n = input.read(buffer)
                    if (n < 0) break
                    out.write(buffer, 0, n)
                    if (out.size() > MAX_MANIFEST_BYTES) throw SecurityException("${apk.name} has a manifest over 8 MiB")
                }
                out.toByteArray()
            }
        }

        var packageName: String? = null
        var versionCode: Long? = null
        var split: String? = null
        AxmlReader(bytes).accept(object : AxmlVisitor() {
            override fun child(ns: String?, name: String?): NodeVisitor? {
                if (name != "manifest") return null
                return object : NodeVisitor() {
                    override fun attr(ns: String?, name: String?, resourceId: Int, type: Int, value: Any?) {
                        when (name) {
                            "package" -> packageName = value as? String
                            "versionCode" -> versionCode = (value as? Number)?.toLong()
                            "split" -> split = value as? String
                        }
                    }

                    // Nothing below the root says what the APK is
                    override fun child(ns: String?, name: String?): NodeVisitor? = null
                }
            }
        })
        return Info(packageName, versionCode, split)
    }

    /** Throws unless [apk] is Discord's [split] (null for the base APK) of version [versionCode] */
    fun require(apk: File, versionCode: Long, split: String?) {
        val info = read(apk)
        if (info.packageName != InstalledDiscord.PACKAGE) {
            throw SecurityException("${apk.name} is ${info.packageName}, not Discord")
        }
        if (info.versionCode != versionCode) {
            throw SecurityException("${apk.name} is Discord ${info.versionCode}, not the $versionCode asked for")
        }
        if (info.split != split) {
            throw SecurityException("${apk.name} is the ${info.split ?: "base APK"}, not the ${split ?: "base APK"}")
        }
    }

    /**
     * Throws unless [apks] are one Discord: the base APK first, then splits, all of the base's version. Returns that
     * version code.
     */
    fun requireOneDiscord(apks: List<File>): Long {
        val base = apks.firstOrNull() ?: throw SecurityException("No Discord APKs")
        val versionCode = read(base).versionCode ?: throw SecurityException("${base.name} has no version code")
        require(base, versionCode, split = null)
        for (apk in apks.drop(1)) {
            val info = read(apk)
            if (info.split.isNullOrEmpty()) throw SecurityException("${apk.name} isn't a split of Discord")
            require(apk, versionCode, info.split)
        }
        return versionCode
    }
}
