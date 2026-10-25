/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.copyuserurls

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.actionscommon.UserSheetActions
import com.lytefast.flexinput.R

internal class CopyUserURLs : EndcordPlugin(
    name = "CopyUserURLs",
    description = "Adds a 'Copy User URL' option to the user context menu.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility", "friends")

    override fun start(context: Context) {
        UserSheetActions.register(name, "Copy User URL", R.e.ic_link_white_24dp) { ctx ->
            // Wrapped in <> like Endcord PC so pasting it in Discord doesn't make an embed
            Common.copy("<https://discord.com/users/${ctx.user.id}>")
        }
    }

    override fun stop(context: Context) {
        UserSheetActions.unregisterAll(name)
        super.stop(context)
    }
}
