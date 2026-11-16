package app.revenge.manager.installer.util

import pxb.android.axml.AxmlWriter
import pxb.android.axml.NodeVisitor
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class DiscordApkManifestTest {
    private val androidNs = "http://schemas.android.com/apk/res/android"

    /** An APK whose manifest names [packageName], [versionCode] and [split], as aapt writes it */
    private fun apk(
        packageName: String = "com.discord",
        versionCode: Int? = 353011,
        split: String? = null,
        withManifest: Boolean = true,
    ): File {
        val writer = AxmlWriter()
        writer.ns("android", androidNs, -1)
        val manifest = writer.child(null, "manifest")
        manifest.attr(null, "package", -1, NodeVisitor.TYPE_STRING, packageName)
        if (versionCode != null) {
            manifest.attr(androidNs, "versionCode", 0x0101021b, NodeVisitor.TYPE_FIRST_INT, versionCode)
        }
        if (split != null) manifest.attr(null, "split", -1, NodeVisitor.TYPE_STRING, split)
        // A child, as every manifest has; its attributes aren't the APK's
        val application = manifest.child(null, "application")
        application.attr(null, "split", -1, NodeVisitor.TYPE_STRING, "not.the.split")
        application.end()
        manifest.end()
        writer.end()

        val file = File.createTempFile("discord", ".apk").apply { deleteOnExit() }
        ZipOutputStream(file.outputStream()).use { zip ->
            if (withManifest) {
                zip.putNextEntry(ZipEntry("AndroidManifest.xml"))
                zip.write(writer.toByteArray())
                zip.closeEntry()
            }
            zip.putNextEntry(ZipEntry("classes.dex"))
            zip.write(byteArrayOf(1, 2, 3))
            zip.closeEntry()
        }
        return file
    }

    @Test
    fun `reads what the manifest's root says the APK is`() {
        val base = DiscordApkManifest.read(apk())
        assertEquals("com.discord", base.packageName)
        assertEquals(353011L, base.versionCode)
        assertNull(base.split)

        assertEquals("config.x86_64", DiscordApkManifest.read(apk(split = "config.x86_64")).split)
    }

    @Test
    fun `Discord's split of the version asked for is taken`() {
        DiscordApkManifest.require(apk(), 353011, split = null)
        DiscordApkManifest.require(apk(split = "config.en"), 353011, split = "config.en")
    }

    @Test
    fun `another app, another version or another split is refused`() {
        assertFailsWith<SecurityException> { DiscordApkManifest.require(apk(packageName = "com.evil"), 353011, null) }
        // An older Discord a mirror hands over for the newest
        assertFailsWith<SecurityException> { DiscordApkManifest.require(apk(versionCode = 300000), 353011, null) }
        assertFailsWith<SecurityException> { DiscordApkManifest.require(apk(versionCode = null), 353011, null) }
        assertFailsWith<SecurityException> {
            DiscordApkManifest.require(apk(split = "config.arm64_v8a"), 353011, split = "config.x86_64")
        }
        // A split where the base APK is asked for, and the other way round
        assertFailsWith<SecurityException> { DiscordApkManifest.require(apk(split = "config.en"), 353011, null) }
        assertFailsWith<SecurityException> { DiscordApkManifest.require(apk(), 353011, "config.en") }
    }

    @Test
    fun `an APK without a manifest is refused`() {
        assertFailsWith<SecurityException> { DiscordApkManifest.read(apk(withManifest = false)) }
    }

    @Test
    fun `the installed Discord's APKs are one Discord`() {
        val apks = listOf(apk(), apk(split = "config.x86_64"), apk(split = "config.en"), apk(split = "config.xxhdpi"))
        assertEquals(353011L, DiscordApkManifest.requireOneDiscord(apks))
    }

    @Test
    fun `APKs of different Discords, or not of Discord, aren't one Discord`() {
        assertFailsWith<SecurityException> { DiscordApkManifest.requireOneDiscord(emptyList()) }
        // A split of another version
        assertFailsWith<SecurityException> {
            DiscordApkManifest.requireOneDiscord(listOf(apk(), apk(versionCode = 352017, split = "config.en")))
        }
        // A second base APK, and a split first
        assertFailsWith<SecurityException> { DiscordApkManifest.requireOneDiscord(listOf(apk(), apk())) }
        assertFailsWith<SecurityException> { DiscordApkManifest.requireOneDiscord(listOf(apk(split = "config.en"))) }
        // A fake com.discord's base with Discord's splits
        assertFailsWith<SecurityException> {
            DiscordApkManifest.requireOneDiscord(listOf(apk(packageName = "com.evil"), apk(split = "config.en")))
        }
    }
}
