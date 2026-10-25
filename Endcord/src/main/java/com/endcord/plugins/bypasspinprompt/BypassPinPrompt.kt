/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.bypasspinprompt

import android.content.Context
import android.view.View
import androidx.fragment.app.FragmentManager
import com.aliucord.entities.EndcordPlugin
import com.aliucord.patcher.instead
import com.discord.app.AppComponent
import com.discord.models.message.Message
import com.discord.widgets.chat.list.actions.MessageActionDialogs
import de.robv.android.xposed.XposedBridge
import java.lang.reflect.Constructor

internal class BypassPinPrompt : EndcordPlugin(
    name = "BypassPinPrompt",
    description = "Bypass the pin prompt when using the pin functions",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("shortcuts")

    // The "Pin it" button handler of Discord's confirmation dialog, which pins or unpins and reports errors
    private val confirmHandler: Constructor<*> by lazy {
        Class.forName("com.discord.widgets.chat.list.actions.MessageActionDialogs\$showPinMessageConfirmation\$1")
            .getDeclaredConstructor(
                Message::class.java,
                Boolean::class.javaPrimitiveType!!,
                AppComponent::class.java,
                Context::class.java,
                Function0::class.java,
            ).apply { isAccessible = true }
    }

    override fun start(context: Context) {
        patcher.instead<MessageActionDialogs>(
            "showPinMessageConfirmation",
            FragmentManager::class.java,
            Context::class.java,
            Message::class.java,
            AppComponent::class.java,
            Function0::class.java,
        ) { param ->
            try {
                val ctx = param.args[1] as Context
                val message = param.args[2] as Message
                val isPinned = message.pinned == true
                @Suppress("UNCHECKED_CAST")
                val onConfirm = confirmHandler.newInstance(message, isPinned, param.args[3], ctx, param.args[4]) as Function1<View, *>
                onConfirm.invoke(View(ctx))
                null
            } catch (e: Throwable) {
                logger.error("Failed to pin without the prompt, showing it instead", e)
                XposedBridge.invokeOriginalMethod(param.method, param.thisObject, param.args)
            }
        }
    }
}
