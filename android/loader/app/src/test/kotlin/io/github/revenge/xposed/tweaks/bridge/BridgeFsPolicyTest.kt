package io.github.revenge.xposed.tweaks.bridge

import io.github.revenge.xposed.tweaks.RevengeUpdater
import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** `revenge.fs.*`: only the app's files and cache folders, and never what the loader trusts written or deleted */
class BridgeFsPolicyTest {
    private val dataDir: File = Files.createTempDirectory("bridge-fs").toFile().canonicalFile
    private val files = File(dataDir, "files").apply { mkdirs() }
    private val cache = File(dataDir, "cache").apply { mkdirs() }

    init {
        // As on a phone: what's there already, so the canonical paths of what exists are compared too
        File(files, "pyoncord/preloads").mkdirs()
        File(files, "pyoncord/loader.json").writeText("{}")
        File(cache, "revenge/previous").mkdirs()
        File(cache, "revenge/bundle.js").writeText("bundle")
    }

    private val policy = BridgeFsPolicy(
        roots = listOf(files, cache),
        protectedPaths = RevengeUpdater.protectedPaths(dataDir.path) + File(cache, LSPATCH_CACHE_DIR),
    )

    @AfterTest
    fun cleanUp() {
        dataDir.deleteRecursively()
    }

    private fun refused(path: String, access: BridgeFsAccess) {
        assertFailsWith<SecurityException>("$access '$path' should be refused") { policy.check(path, access) }
    }

    private fun allowed(path: String, access: BridgeFsAccess) {
        assertEquals(File(path).canonicalFile, policy.check(path, access))
    }

    private fun both(path: String, check: (String, BridgeFsAccess) -> Unit) {
        check(path, BridgeFsAccess.READ)
        check(path, BridgeFsAccess.WRITE)
    }

    @Test
    fun `inside the files and cache folders`() {
        both("$files/pyoncord/plugins/x.json", ::allowed)
        both("$files/vendetta_theme.json", ::allowed)
        both("$cache/backup.json", ::allowed)
        both("$cache/revenge/dexkit.json", ::allowed)
    }

    @Test
    fun `nowhere else, however it's spelled`() {
        both("$dataDir/shared_prefs/endcord_loader_security.xml", ::refused)
        both("$dataDir/databases/x.db", ::refused)
        both("$files/../shared_prefs/x.xml", ::refused)
        both("$files/pyoncord/../../databases/x.db", ::refused)
        both("$cache/./../files/../../outside", ::refused)
        both("/etc/hosts", ::refused)
    }

    @Test
    fun `not a folder that only starts like one`() {
        both("$dataDir/files-evil/a.js", ::refused)
        both("$dataDir/cache2/a.js", ::refused)
        both("${files.path}evil/a.js", ::refused)
    }

    @Test
    fun `only absolute paths`() {
        both("files/pyoncord/x.json", ::refused)
        both("", ::refused)
        both("./x", ::refused)
    }

    @Test
    fun `the loader's own files can be read but not written or deleted`() {
        val protected = listOf(
            "$files/pyoncord/preloads/evil.js",
            "$files/pyoncord/preloads",
            "$files/pyoncord/preloads/sub/deeper.js",
            "$files/pyoncord/loader.json",
            "$files/pyoncord/release-sequence",
            "$cache/revenge/bundle.js",
            "$cache/revenge/etag.txt",
            "$cache/revenge/manifest.json",
            "$cache/revenge/endcord-release.json",
            "$cache/revenge/endcord-release.sig",
            "$cache/revenge/bundle-boot.json",
            "$cache/revenge/previous/bundle.js",
            "$cache/revenge/candidate",
            "$cache/lspatch/origin/base.apk",
        )
        for (path in protected) {
            refused(path, BridgeFsAccess.WRITE)
            allowed(path, BridgeFsAccess.READ)
        }
    }

    @Test
    fun `protected paths in other spellings`() {
        for (path in listOf(
            "$files/pyoncord/./loader.json",
            "$files//pyoncord//loader.json",
            "$files/pyoncord/plugins/../loader.json",
            "$cache/../files/pyoncord/preloads/x.js",
            "$files/PYONCORD/Loader.JSON",
            "$files/pyoncord/Preloads/x.js",
            "$cache/revenge/previous/",
            "$cache/revenge/../revenge/bundle.js",
        )) refused(path, BridgeFsAccess.WRITE)
    }

    @Test
    fun `what the loader puts back over its files, beside them`() {
        for (path in listOf(
            "$files/pyoncord/loader.json.bak",
            "$files/pyoncord/release-sequence.bak",
            "$files/pyoncord/release-sequence.tmp",
            "$cache/revenge/bundle.js.bak",
            "$cache/revenge/endcord-release.json.new",
        )) refused(path, BridgeFsAccess.WRITE)
        // Only those named after it
        allowed("$files/pyoncord/loader.jsonx", BridgeFsAccess.WRITE)
        allowed("$files/pyoncord/preloads-old/x.js", BridgeFsAccess.WRITE)
    }

    @Test
    fun `not a folder that holds one, which deleting would take along`() {
        for (path in listOf("$files/pyoncord", "$files", "$cache/revenge", "$cache", "$cache/revenge/")) {
            refused(path, BridgeFsAccess.WRITE)
        }
        allowed("$files/pyoncord/plugins", BridgeFsAccess.WRITE)
    }

    @Test
    fun `a symlink doesn't lead out`() {
        val outside = File(dataDir, "shared_prefs").apply { mkdirs() }
        val link = File(files, "link")
        val linkToPreloads = File(files, "preloads-link")
        try {
            Files.createSymbolicLink(link.toPath(), outside.toPath())
            Files.createSymbolicLink(linkToPreloads.toPath(), File(files, "pyoncord/preloads").toPath())
        } catch (e: Exception) {
            // Symlinks need a privilege on Windows; this case is for the phone's file system
            return
        }
        both("$link/x.xml", ::refused)
        refused("$linkToPreloads/evil.js", BridgeFsAccess.WRITE)
    }
}
