/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.copyprofilecolors

import android.content.Context
import com.aliucord.Utils
import com.aliucord.api.rn.user.RNUserProfile
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.actionscommon.UserSheetActions
import com.lytefast.flexinput.R

internal class CopyProfileColors : EndcordPlugin(
    name = "CopyProfileColors",
    description = "A plugin to copy people's profile gradient colors to clipboard.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "customisation")

    override fun start(context: Context) {
        UserSheetActions.register(name, "Copy Profile Colors", R.e.ic_copy_24dp) { ctx ->
            copyColors((ctx.state.userProfile as? RNUserProfile)?.userProfile?.themeColors)
        }
        UserSheetActions.register(
            name,
            "Copy Server Profile Colors",
            R.e.ic_copy_24dp,
            visible = { ctx -> hasColors((ctx.state.userProfile as? RNUserProfile)?.guildMemberProfile?.themeColors) },
        ) { ctx ->
            copyColors((ctx.state.userProfile as? RNUserProfile)?.guildMemberProfile?.themeColors)
        }
    }

    override fun stop(context: Context) {
        UserSheetActions.unregisterAll(name)
        super.stop(context)
    }

    private fun hasColors(colors: IntArray?) = colors != null && colors.size >= 2

    private fun copyColors(colors: IntArray?) {
        if (colors == null || !hasColors(colors)) {
            Utils.showToast(I18n.t("No profile colors found!"))
            return
        }
        // Same format as Endcord PC so pasted values look the same everywhere
        val text = "Primary-color #${hex(colors[0])}, Secondary-Color #${hex(colors[1])}"
        Common.copy(text, "Profile colors copied to clipboard!")
    }

    private fun hex(color: Int) = Integer.toHexString(color and 0xFFFFFF).padStart(6, '0')
}
