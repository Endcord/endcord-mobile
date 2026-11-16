package app.revenge.manager.installer.util

import pxb.android.axml.AxmlReader
import pxb.android.axml.AxmlVisitor
import pxb.android.axml.AxmlWriter
import pxb.android.axml.NodeVisitor

object ManifestPatcher {
    private const val ANDROID_NAMESPACE = "http://schemas.android.com/apk/res/android"
    private const val USES_CLEARTEXT_TRAFFIC = "usesCleartextTraffic"
    private const val DEBUGGABLE = "debuggable"
    private const val REQUEST_LEGACY_EXTERNAL_STORAGE = "requestLegacyExternalStorage"
    private const val NETWORK_SECURITY_CONFIG = "networkSecurityConfig"
    private const val LABEL = "label"
    private const val PACKAGE = "package"
    private const val COMPILE_SDK_VERSION = "compileSdkVersion"
    private const val COMPILE_SDK_VERSION_CODENAME = "compileSdkVersionCodename"
    private const val DRNE_PERMISSION = "DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"

    // android.R.attr ids of the attributes added to <application>
    internal const val ATTR_DEBUGGABLE = 0x0101000f
    internal const val ATTR_USES_CLEARTEXT_TRAFFIC = 0x010104ec
    internal const val ATTR_REQUEST_LEGACY_EXTERNAL_STORAGE = 0x01010603
    internal const val ATTR_NETWORK_SECURITY_CONFIG = 0x01010527
    private const val DISCORD_DRNE_PERMISSION = "com.discord.$DRNE_PERMISSION"

    /**
     * @param cleartextTraffic Whether the app may use plain http, which a bundle served from a developer's machine
     * needs; otherwise nothing in it, plugins included, can talk to a server without TLS
     */
    fun patchManifest(
        manifestBytes: ByteArray,
        packageName: String,
        appName: String,
        debuggable: Boolean,
        cleartextTraffic: Boolean,
    ): ByteArray {
        val reader = AxmlReader(manifestBytes)
        val writer = AxmlWriter()

        reader.accept(object : AxmlVisitor(writer) {
            override fun child(ns: String?, name: String?) =
                object : ReplaceAttrsVisitor(
                    super.child(ns, name),
                    mapOf(
                        PACKAGE to packageName,
                        COMPILE_SDK_VERSION to 23,
                        COMPILE_SDK_VERSION_CODENAME to "6.0-2438415"
                    )
                ) {
                    override fun child(ns: String?, name: String): NodeVisitor {
                        val nv = super.child(ns, name)

                        return when (name) {
                            "permission" -> object : NodeVisitor(nv) {
                                override fun attr(
                                    ns: String?,
                                    name: String?,
                                    resourceId: Int,
                                    type: Int,
                                    value: Any?
                                ) {
                                    if(name == "name" && value == DISCORD_DRNE_PERMISSION) {
                                        super.attr(ns, name, resourceId, type, "$packageName.$DRNE_PERMISSION")
                                    } else {
                                        super.attr(ns, name, resourceId, type, value)
                                    }
                                }
                            }

                            "uses-permission" -> object : NodeVisitor(nv) {
                                override fun attr(
                                    ns: String?,
                                    name: String?,
                                    resourceId: Int,
                                    type: Int,
                                    value: Any?
                                ) {
                                    if(name == "name" && value == DISCORD_DRNE_PERMISSION) {
                                        super.attr(ns, name, resourceId, type, "$packageName.$DRNE_PERMISSION")
                                    }

                                    if (name != "maxSdkVersion") {
                                        super.attr(ns, name, resourceId, type, value)
                                    }
                                }
                            }

                            "application" -> object : ReplaceAttrsVisitor(
                                nv,
                                mapOf(
                                    LABEL to appName,
                                    DEBUGGABLE to debuggable,
                                    USES_CLEARTEXT_TRAFFIC to cleartextTraffic,
                                    REQUEST_LEGACY_EXTERNAL_STORAGE to true
                                )
                            ) {
                                private var addDebuggable = debuggable
                                private var addLegacyStorage = true
                                private var addUseClearTextTraffic = cleartextTraffic

                                override fun attr(
                                    ns: String?,
                                    name: String,
                                    resourceId: Int,
                                    type: Int,
                                    value: Any?
                                ) {
                                    // Discord's network security config says cleartextTrafficPermitted=false, and a
                                    // config overrides usesCleartextTraffic: plain http (a developer's own bundle) is
                                    // only let through without it. Its base config holds nothing else
                                    if (cleartextTraffic && (name == NETWORK_SECURITY_CONFIG || resourceId == ATTR_NETWORK_SECURITY_CONFIG)) return
                                    super.attr(ns, name, resourceId, type, value)
                                    if (name == REQUEST_LEGACY_EXTERNAL_STORAGE) addLegacyStorage =
                                        false
                                    if (name == DEBUGGABLE) addDebuggable = false
                                    if (name == USES_CLEARTEXT_TRAFFIC) addUseClearTextTraffic =
                                        false
                                }

                                override fun child(ns: String?, name: String): NodeVisitor {
                                    val visitor = super.child(ns, name)

                                    return when (name) {
                                        "activity" -> ReplaceAttrsVisitor(
                                            visitor,
                                            mapOf("label" to appName)
                                        )

                                        "provider" -> object : NodeVisitor(visitor) {
                                            override fun attr(
                                                ns: String?,
                                                name: String,
                                                resourceId: Int,
                                                type: Int,
                                                value: Any?
                                            ) {
                                                super.attr(
                                                    ns,
                                                    name,
                                                    resourceId,
                                                    type,
                                                    if (name == "authorities") {
                                                        (value as String).replace(
                                                            "com.discord",
                                                            packageName
                                                        )
                                                    } else {
                                                        value
                                                    }
                                                )
                                            }
                                        }

                                        else -> visitor
                                    }
                                }

                                // Android reads the framework's attributes by their resource id, not their name:
                                // added without one, they were in the file but Android never applied them
                                override fun end() {
                                    if (addLegacyStorage) super.attr(
                                        ANDROID_NAMESPACE,
                                        REQUEST_LEGACY_EXTERNAL_STORAGE,
                                        ATTR_REQUEST_LEGACY_EXTERNAL_STORAGE,
                                        TYPE_INT_BOOLEAN,
                                        1
                                    )
                                    if (addDebuggable) super.attr(
                                        ANDROID_NAMESPACE,
                                        DEBUGGABLE,
                                        ATTR_DEBUGGABLE,
                                        TYPE_INT_BOOLEAN,
                                        1
                                    )
                                    if (addUseClearTextTraffic) super.attr(
                                        ANDROID_NAMESPACE,
                                        USES_CLEARTEXT_TRAFFIC,
                                        ATTR_USES_CLEARTEXT_TRAFFIC,
                                        TYPE_INT_BOOLEAN,
                                        1
                                    )
                                    super.end()
                                }
                            }

                            else -> nv
                        }
                    }
                }
        })

        return writer.toByteArray()
    }

    fun renamePackage(
        manifestBytes: ByteArray,
        packageName: String
    ): ByteArray {
        val reader = AxmlReader(manifestBytes)
        val writer = AxmlWriter()

        reader.accept(
            object : AxmlVisitor(writer) {
                override fun child(ns: String?, name: String?): ReplaceAttrsVisitor {
                    return ReplaceAttrsVisitor(
                        super.child(ns, name),
                        mapOf("package" to packageName)
                    )
                }
            }
        )

        return writer.toByteArray()
    }

    private open class ReplaceAttrsVisitor(
        nv: NodeVisitor,
        private val attrs: Map<String, Any>
    ) : NodeVisitor(nv) {
        override fun attr(ns: String?, name: String, resourceId: Int, type: Int, value: Any?) {
            val replace = attrs.containsKey(name)
            val newValue = attrs[name]

            super.attr(
                ns,
                name,
                resourceId,
                if (newValue is String) TYPE_STRING else type,
                if (replace) newValue else value
            )
        }
    }
}