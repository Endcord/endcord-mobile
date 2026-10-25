/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.platformspoofer

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.entities.PluginSetting.Choice.Option
import com.discord.gateway.GatewaySocket
import de.robv.android.xposed.XC_MethodHook
import java.lang.reflect.Field
import java.lang.reflect.Method
import java.util.WeakHashMap

/**
 * Like Endcord PC, only the `browser` property of the gateway identify changes: that is what Discord uses to show
 * the desktop, web or mobile status icon. Login and every REST request keep the app's real properties, and if
 * anything here fails the app identifies exactly as it normally does.
 */
internal class PlatformSpoofer : EndcordPlugin(
    name = "PlatformSpoofer",
    description = "Spoof what platform or device you're on",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility")

    /** The platform is sent when connecting, so a change only shows after a restart. */
    override val restartRequired = true

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            "platform", "What platform to show up as on",
            "We can't guarantee this plugin won't get you warned or banned.",
            listOf(
                Option("desktop", "Desktop"),
                Option("web", "Web"),
                Option("android", "Android"),
                Option("ios", "iOS"),
                Option("xbox", "Xbox"),
                Option("playstation", "Playstation"),
                Option("vr", "VR"),
            ),
        ),
    )

    private val fProperties: Field by lazy {
        GatewaySocket::class.java.getDeclaredField("identifyProperties").apply { isAccessible = true }
    }
    private val mDoIdentify: Method by lazy { GatewaySocket::class.java.getDeclaredMethod("doIdentify") }

    /** Socket -> the properties the app gave it, to put back when the plugin stops. */
    private val originals = WeakHashMap<GatewaySocket, Map<String, Any?>>()

    override fun start(context: Context) {
        patcher.patch(mDoIdentify, object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                try {
                    val socket = param.thisObject as GatewaySocket
                    @Suppress("UNCHECKED_CAST")
                    val original = synchronized(originals) {
                        originals.getOrPut(socket) { fProperties[socket] as Map<String, Any?> }
                    }
                    val browser = browser() ?: return
                    fProperties[socket] = HashMap(original).apply { put("browser", browser) }
                } catch (e: Throwable) {
                    logger.error("Failed to spoof the platform, identifying normally", e)
                }
            }
        })
    }

    override fun stop(context: Context) {
        super.stop(context)
        synchronized(originals) {
            for ((socket, properties) in originals) {
                try {
                    fProperties[socket] = properties
                } catch (e: Throwable) {
                    logger.error("Failed to restore the identify properties", e)
                }
            }
            originals.clear()
        }
    }

    /** Endcord PC's `getPlatform`: the browser name Discord recognizes for each platform. */
    private fun browser(): String? = when (choice("platform")) {
        "desktop" -> "Discord Client"
        "web" -> "Discord Web"
        "ios" -> "Discord iOS"
        "android" -> "Discord Android"
        "xbox", "playstation" -> "Discord Embedded"
        "vr" -> "Discord VR"
        else -> null
    }
}
