/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.silenttyping

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.instead
import com.aliucord.wrappers.ChannelWrapper.Companion.isDM
import com.discord.stores.StoreStream
import com.discord.stores.StoreUserTyping
import de.robv.android.xposed.XposedBridge

internal class SilentTyping : EndcordPlugin(
    name = "SilentTyping",
    description = "Hide that you are typing",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("privacy", "chat")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            key = "showInDms",
            label = "Still show typing in DMs",
            description = "Only hide your typing indicator in servers",
        ),
    )

    override fun start(context: Context) {
        patcher.instead<StoreUserTyping>("setUserTyping", Long::class.javaPrimitiveType!!) { param ->
            if (bool("showInDms")) {
                val channel = StoreStream.getChannels().getChannel(param.args[0] as Long)
                if (channel != null && channel.isDM()) {
                    return@instead XposedBridge.invokeOriginalMethod(param.method, param.thisObject, param.args)
                }
            }
            null
        }
    }
}
