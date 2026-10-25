/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.notypinganimation

import android.content.Context
import com.aliucord.patcher.instead
import com.discord.views.typing.TypingDots
import com.endcord.plugins.guildsbcommon.GuildsBPlugin
import com.endcord.plugins.guildsbcommon.TypingAnimation

/**
 * Discord's typing dots (`TypingDots`, used by the "is typing" bar above the chat input and by HomeTyping) start
 * their looping scale animation in `a(boolean)`; skipping it leaves the three dots drawn still. The dots of
 * TypingIndicator stop moving too.
 */
internal class NoTypingAnimation : GuildsBPlugin(
    name = "NoTypingAnimation",
    description = "Disables the CPU-intensive typing dots animation",
) {
    override val tags = listOf("appearance")

    override fun start(context: Context) {
        TypingAnimation.disabled = true
        patcher.instead<TypingDots>("a", Boolean::class.javaPrimitiveType!!) { null }
    }

    override fun stop(context: Context) {
        TypingAnimation.disabled = false
        super.stop(context)
    }
}
