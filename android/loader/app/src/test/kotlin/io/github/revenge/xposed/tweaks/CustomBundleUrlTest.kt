package io.github.revenge.xposed.tweaks

import io.github.revenge.xposed.BuildConfig
import io.github.revenge.xposed.RevengeConstants
import io.github.revenge.xposed.RevengeJson
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The custom bundle link: in use only when allowed (or in a developer's own build), and the published path otherwise */
class CustomBundleUrlTest {
    private val published = BuildConfig.BUNDLE_URL
    private val folder = published.substringBeforeLast('/')
    private val custom = "https://evil.example/endcord.js"

    @Test
    fun `the custom link is in use only when on, and debuggable or allowed`() {
        for (debuggable in listOf(false, true)) for (approved in listOf(false, true)) {
            assertFalse(customUrlInUse(enabled = false, debuggable = debuggable, approved = approved))
        }
        assertTrue(customUrlInUse(enabled = true, debuggable = true, approved = false))
        assertTrue(customUrlInUse(enabled = true, debuggable = true, approved = true))
        assertTrue(customUrlInUse(enabled = true, debuggable = false, approved = true))
        assertFalse(customUrlInUse(enabled = true, debuggable = false, approved = false))
    }

    @Test
    fun `the saved bundle's source is read in every form`() {
        assertEquals(SavedSource(custom, "\"abc\""), parseSavedSource("$custom\n\"abc\"", published))
        assertEquals(SavedSource(custom, null), parseSavedSource(custom, published))
        assertEquals(SavedSource(custom, null), parseSavedSource("  $custom  \n\n", published))
        // The older form: an ETag of the published bundle alone
        assertEquals(SavedSource(published, "\"abc\""), parseSavedSource("\"abc\"", published))
        assertEquals(SavedSource(published, "W/\"abc\""), parseSavedSource("W/\"abc\"", published))
        assertNull(parseSavedSource("", published))
        assertNull(parseSavedSource("a\nb\nc", published))
        for (etag in listOf(null, "\"x\"")) {
            assertEquals(SavedSource(custom, etag), parseSavedSource(savedSourceText(custom, etag), published))
        }
    }

    @Test
    fun `only where the bundle is published counts as published`() {
        assertTrue(isPublishedBundleUrl(published, published))
        assertTrue(isPublishedBundleUrl("$folder/endcord.v96.hbc", published))
        assertFalse(isPublishedBundleUrl("$folder/evil.js", published))
        assertFalse(isPublishedBundleUrl("$folder/sub/endcord.v96.hbc", published))
        assertFalse(isPublishedBundleUrl("$folder/endcord.v96.hbc/../evil.js", published))
        assertFalse(isPublishedBundleUrl("https://evil.example/endcord.v96.hbc", published))
        assertFalse(isPublishedBundleUrl("$folder-evil/endcord.v96.hbc", published))
        assertFalse(isPublishedBundleUrl(custom, published))
    }

    @Test
    fun `a saved bundle runs as the published one only when it came from there`() {
        val isPublished = { url: String -> isPublishedBundleUrl(url, published) }
        assertTrue(savedBundleMayRunAsPublished(published, customUrlWaiting = false, isPublished))
        assertTrue(savedBundleMayRunAsPublished(published, customUrlWaiting = true, isPublished))
        assertFalse(savedBundleMayRunAsPublished(custom, customUrlWaiting = false, isPublished))
        assertFalse(savedBundleMayRunAsPublished(custom, customUrlWaiting = true, isPublished))
        // Unknown: as before, unless a custom link waits, which an older loader may have saved it from
        assertTrue(savedBundleMayRunAsPublished(null, customUrlWaiting = false, isPublished))
        assertFalse(savedBundleMayRunAsPublished(null, customUrlWaiting = true, isPublished))
    }

    @Test
    fun `turning the link off keeps the rest of the config`() {
        val json = """{"customLoadUrl":{"enabled":true,"url":"$custom","manifestUrl":"m"},"other":42}"""
        val off = RevengeJson.parseToJsonElement(configWithCustomUrlOff(json)).jsonObject
        assertEquals("42", off["other"]!!.jsonPrimitive.content)
        val customLoadUrl = off["customLoadUrl"]!!.jsonObject
        assertEquals("false", customLoadUrl["enabled"]!!.jsonPrimitive.content)
        assertEquals(custom, customLoadUrl["url"]!!.jsonPrimitive.content)
        assertEquals("m", customLoadUrl["manifestUrl"]!!.jsonPrimitive.content)
        assertFalse(RevengeJson.decodeFromString<LoaderConfig>(configWithCustomUrlOff(json)).customLoadUrl.enabled)

        for (broken in listOf(null, "", "not json", "[1]", """{"customLoadUrl":7}""")) {
            val config = RevengeJson.parseToJsonElement(configWithCustomUrlOff(broken)) as JsonObject
            assertEquals("false", config["customLoadUrl"]!!.jsonObject["enabled"]!!.jsonPrimitive.content, "$broken")
        }
    }
}

/** The updater with a custom link set in an app that isn't a developer's build: as if it were off, until allowed */
class CustomBundleUrlWaitingTest {
    private val dataDir: File = Files.createTempDirectory("custom-url").toFile()
    private val cacheDir = File(dataDir, RevengeConstants.CACHE_DIR).apply { mkdirs() }
    private val bundle = File(cacheDir, RevengeConstants.MAIN_SCRIPT_FILE)
    private val etag = File(cacheDir, "etag.txt")
    private val guard = BundleBootGuard(cacheDir)
    private val custom = "https://evil.example/endcord.js"

    @AfterTest
    fun cleanUp() {
        dataDir.deleteRecursively()
    }

    private fun setCustomUrl() {
        File(dataDir, "${RevengeConstants.FILES_DIR}/loader.json").apply { parentFile!!.mkdirs() }
            .writeText("""{ "customLoadUrl": { "enabled": true, "url": "$custom" } }""")
    }

    @Test
    fun `a custom link waits, and the published bundle is what loads and is reported`() {
        setCustomUrl()
        RevengeUpdater.init(dataDir.path, debuggable = false)
        assertTrue(RevengeUpdater.customUrlWaiting())

        bundle.writeText("published")
        etag.writeText(BuildConfig.BUNDLE_URL)
        assertTrue(RevengeUpdater.hasUsableBundle())
        RevengeUpdater.beforeBundleLoad()
        RevengeUpdater.noteLoaded("downloaded")
        // No release files in this test: let through unsigned in this build, and never "custom"
        assertEquals("unsigned", RevengeUpdater.loadedBundleKind())
        // The boot guard watches it, as the published bundle
        assertEquals(1, guard.state().loads)
        assertTrue(RevengeUpdater.rollbackGuardsUpdates())
    }

    @Test
    fun `while a custom link waits, a bundle saved from it doesn't run`() {
        setCustomUrl()
        RevengeUpdater.init(dataDir.path, debuggable = false)
        bundle.writeText("from the custom link")

        etag.writeText("$custom\n\"etag\"")
        assertFalse(RevengeUpdater.hasUsableBundle())
        etag.writeText(custom)
        assertFalse(RevengeUpdater.hasUsableBundle())
        // Saved by an older loader, which left no link without an ETag
        etag.delete()
        assertFalse(RevengeUpdater.hasUsableBundle())
    }

    @Test
    fun `in a debuggable app the custom link is in use at once`() {
        setCustomUrl()
        RevengeUpdater.init(dataDir.path, debuggable = true)
        assertFalse(RevengeUpdater.customUrlWaiting())
        bundle.writeText("from the custom link")
        etag.writeText(custom)
        assertTrue(RevengeUpdater.hasUsableBundle())
        RevengeUpdater.beforeBundleLoad()
        RevengeUpdater.noteLoaded("downloaded")
        assertEquals("custom", RevengeUpdater.loadedBundleKind())
        assertFalse(RevengeUpdater.rollbackGuardsUpdates())
    }

    @Test
    fun `with the link off, a bundle saved from it isn't taken for the published one`() {
        RevengeUpdater.init(dataDir.path, debuggable = false)
        assertFalse(RevengeUpdater.customUrlWaiting())
        bundle.writeText("from the custom link")
        etag.writeText(custom)
        assertFalse(RevengeUpdater.hasUsableBundle())
        // One whose source isn't known (an older loader's, or after a rollback) still runs as before
        etag.delete()
        assertTrue(RevengeUpdater.hasUsableBundle())
    }

    @Test
    fun `a link that isn't allowed at all never waits`() {
        File(dataDir, "${RevengeConstants.FILES_DIR}/loader.json").apply { parentFile!!.mkdirs() }
            .writeText("""{ "customLoadUrl": { "enabled": true, "url": "http://evil.example/endcord.js" } }""")
        RevengeUpdater.init(dataDir.path, debuggable = false)
        assertFalse(RevengeUpdater.customUrlWaiting())
    }
}
