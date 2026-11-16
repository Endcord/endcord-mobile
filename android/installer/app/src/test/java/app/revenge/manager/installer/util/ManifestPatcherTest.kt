package app.revenge.manager.installer.util

import pxb.android.axml.AxmlReader
import pxb.android.axml.AxmlVisitor
import pxb.android.axml.AxmlWriter
import pxb.android.axml.NodeVisitor
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ManifestPatcherTest {
    private val androidNs = "http://schemas.android.com/apk/res/android"

    private data class Attr(val resourceId: Int, val value: Any?)

    /** A Discord-like manifest; [debuggableFalse] gives <application> an android:debuggable="false" already */
    private fun manifest(debuggableFalse: Boolean = false): ByteArray {
        val writer = AxmlWriter()
        writer.ns("android", androidNs, -1)
        val root = writer.child(null, "manifest")
        root.attr(null, "package", -1, NodeVisitor.TYPE_STRING, "com.discord")
        val application = root.child(null, "application")
        application.attr(androidNs, "label", 0x01010001, NodeVisitor.TYPE_STRING, "Discord")
        if (debuggableFalse) {
            application.attr(androidNs, "debuggable", ManifestPatcher.ATTR_DEBUGGABLE, NodeVisitor.TYPE_INT_BOOLEAN, false)
        }
        // As Discord's: a network security config that refuses plain http
        application.attr(androidNs, "networkSecurityConfig", ManifestPatcher.ATTR_NETWORK_SECURITY_CONFIG, NodeVisitor.TYPE_REFERENCE, 0x7f160010)
        application.end()
        root.end()
        writer.end()
        return writer.toByteArray()
    }

    /** The attributes of <application> in [bytes], by name */
    private fun applicationAttrs(bytes: ByteArray): Map<String, Attr> {
        val attrs = mutableMapOf<String, Attr>()
        AxmlReader(bytes).accept(object : AxmlVisitor() {
            override fun child(ns: String?, name: String?): NodeVisitor = object : NodeVisitor() {
                override fun child(ns: String?, name: String?): NodeVisitor? =
                    if (name != "application") null else object : NodeVisitor() {
                        override fun attr(ns: String?, name: String?, resourceId: Int, type: Int, value: Any?) {
                            if (name != null) attrs[name] = Attr(resourceId, value)
                        }
                    }
            }
        })
        return attrs
    }

    private fun isTrue(value: Any?) = value == true || (value is Number && value.toInt() != 0)

    @Test
    fun `added attributes carry the framework's resource ids, which Android reads them by`() {
        val attrs = applicationAttrs(
            ManifestPatcher.patchManifest(manifest(), "com.endcord.next", "Endcord", debuggable = true, cleartextTraffic = true)
        )
        assertEquals(ManifestPatcher.ATTR_DEBUGGABLE, attrs["debuggable"]?.resourceId)
        assertTrue(isTrue(attrs["debuggable"]?.value))
        assertEquals(ManifestPatcher.ATTR_USES_CLEARTEXT_TRAFFIC, attrs["usesCleartextTraffic"]?.resourceId)
        assertTrue(isTrue(attrs["usesCleartextTraffic"]?.value))
        assertEquals(ManifestPatcher.ATTR_REQUEST_LEGACY_EXTERNAL_STORAGE, attrs["requestLegacyExternalStorage"]?.resourceId)
    }

    @Test
    fun `an existing debuggable is set, keeping its id`() {
        val attrs = applicationAttrs(
            ManifestPatcher.patchManifest(manifest(debuggableFalse = true), "com.endcord.next", "Endcord", debuggable = true, cleartextTraffic = false)
        )
        assertEquals(ManifestPatcher.ATTR_DEBUGGABLE, attrs["debuggable"]?.resourceId)
        assertTrue(isTrue(attrs["debuggable"]?.value))
    }

    @Test
    fun `a release build adds neither debuggable nor plain http, and keeps Discord's network config`() {
        val attrs = applicationAttrs(
            ManifestPatcher.patchManifest(manifest(), "com.endcord.next", "Endcord", debuggable = false, cleartextTraffic = false)
        )
        assertNull(attrs["debuggable"])
        assertNull(attrs["usesCleartextTraffic"])
        assertEquals("Endcord", attrs["label"]?.value)
        assertEquals(ManifestPatcher.ATTR_NETWORK_SECURITY_CONFIG, attrs["networkSecurityConfig"]?.resourceId)
    }

    @Test
    fun `plain http drops the network config that would refuse it`() {
        val attrs = applicationAttrs(
            ManifestPatcher.patchManifest(manifest(), "com.endcord.next", "Endcord", debuggable = true, cleartextTraffic = true)
        )
        assertNull(attrs["networkSecurityConfig"])
        assertTrue(isTrue(attrs["usesCleartextTraffic"]?.value))
    }
}
