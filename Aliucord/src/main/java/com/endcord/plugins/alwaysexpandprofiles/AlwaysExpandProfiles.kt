/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.alwaysexpandprofiles

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.patcher.after
import com.discord.widgets.user.usersheet.WidgetUserSheet
import com.discord.widgets.user.usersheet.WidgetUserSheetViewModel
import java.util.Collections
import java.util.WeakHashMap

internal class AlwaysExpandProfiles : EndcordPlugin(
    name = "AlwaysExpandProfiles",
    description = "Always opens user profile sheets fully expanded instead of halfway",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "profiles")

    /** Sheets already expanded, so the user can still drag one down after it loaded. */
    private val expanded: MutableSet<WidgetUserSheet> = Collections.newSetFromMap(WeakHashMap())

    override fun start(context: Context) {
        patcher.after<WidgetUserSheet>("configureUI", WidgetUserSheetViewModel.ViewState::class.java) { param ->
            if (param.args[0] !is WidgetUserSheetViewModel.ViewState.Loaded) return@after
            if (!expanded.add(this)) return@after
            val sheet = this
            try {
                view?.post {
                    try {
                        if (sheet.isAdded) sheet.setBottomSheetState(STATE_EXPANDED)
                    } catch (e: Throwable) {
                        this@AlwaysExpandProfiles.logger.error("Failed to expand the profile sheet", e)
                    }
                }
            } catch (e: Throwable) {
                this@AlwaysExpandProfiles.logger.error("Failed to expand the profile sheet", e)
            }
        }
    }

    override fun stop(context: Context) {
        expanded.clear()
        super.stop(context)
    }

    private companion object {
        /** BottomSheetBehavior.STATE_EXPANDED */
        const val STATE_EXPANDED = 3
    }
}
