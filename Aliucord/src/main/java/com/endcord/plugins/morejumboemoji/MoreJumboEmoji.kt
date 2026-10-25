/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.morejumboemoji

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.discord.simpleast.core.node.Node
import com.discord.utilities.textprocessing.MessagePreprocessor
import com.discord.utilities.textprocessing.node.EmojiNode
import de.robv.android.xposed.XC_MethodHook
import java.lang.reflect.Field

internal class MoreJumboEmoji : EndcordPlugin(
    name = "MoreJumboEmoji",
    description = "Unlock the maximum amount of jumbo emoji",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("emotes", "customisation")

    override val settingsSchema = listOf(
        PluginSetting.Number("threshold", "Number of emojis that are allowed to be jumbo", default = 50, min = 0, max = 200),
        PluginSetting.Switch("unlimited", "Unlimited jumbo emojis"),
    )

    private val fShouldJumboify: Field by lazy {
        MessagePreprocessor::class.java.getDeclaredField("shouldJumboify").apply { isAccessible = true }
    }
    private val fCustomEmojiCount: Field by lazy {
        MessagePreprocessor::class.java.getDeclaredField("customEmojiCount").apply { isAccessible = true }
    }

    private val wasJumbo = ThreadLocal<Boolean>()

    override fun start(context: Context) {
        // processNode counts emoji and stops jumboifying once there are more than 27 (a constant inlined into
        // the method). Undo that when the count is still within the user's limit.
        patcher.patch(
            MessagePreprocessor::class.java.getDeclaredMethod("processNode", Node::class.java),
            object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam) {
                    if (param.args[0] !is EmojiNode<*>) return
                    try {
                        wasJumbo.set(fShouldJumboify.getBoolean(param.thisObject))
                    } catch (e: Throwable) {
                        logger.error("Failed to read jumbo state", e)
                    }
                }

                override fun afterHookedMethod(param: MethodHookParam) {
                    if (param.args[0] !is EmojiNode<*>) return
                    try {
                        if (wasJumbo.get() != true) return
                        wasJumbo.set(false)
                        val preprocessor = param.thisObject
                        if (fShouldJumboify.getBoolean(preprocessor)) return
                        val count = fCustomEmojiCount.getInt(preprocessor)
                        if (bool("unlimited") || count <= int("threshold")) fShouldJumboify.setBoolean(preprocessor, true)
                    } catch (e: Throwable) {
                        logger.error("Failed to update jumbo state", e)
                    }
                }
            },
        )
    }
}
