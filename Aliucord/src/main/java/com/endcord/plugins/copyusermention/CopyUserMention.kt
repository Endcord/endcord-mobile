/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.copyusermention

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.actionscommon.UserSheetActions
import com.lytefast.flexinput.R

internal class CopyUserMention : EndcordPlugin(
    name = "CopyUserMention",
    description = "Adds a button to copy user's mention on the user context menu, works best with ValidUser.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override fun start(context: Context) {
        UserSheetActions.register(name, "Copy User Mention", R.e.ic_mentions_white_24dp) { ctx ->
            Common.copy("<@${ctx.user.id}>")
        }
    }

    override fun stop(context: Context) {
        UserSheetActions.unregisterAll(name)
        super.stop(context)
    }
}
