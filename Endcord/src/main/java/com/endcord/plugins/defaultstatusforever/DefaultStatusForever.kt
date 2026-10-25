/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.defaultstatusforever

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.discord.widgets.user.WidgetUserSetCustomStatusViewModel
import de.robv.android.xposed.XC_MethodHook

internal class DefaultStatusForever : EndcordPlugin(
    name = "DefaultStatusForever",
    description = "Make statuses default to last forever",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("activity", "utility")

    private val handleStoreState by lazy {
        WidgetUserSetCustomStatusViewModel::class.java.getDeclaredMethod(
            "handleStoreState",
            WidgetUserSetCustomStatusViewModel.StoreState::class.java,
        )
    }

    override fun start(context: Context) {
        // The custom status screen fills its form once, from the saved status, with "Clear after: Today" preselected.
        // Right after that first fill, switch it to "Don't clear".
        patcher.patch(handleStoreState, object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                wasLoaded.set(isLoaded(param.thisObject))
            }

            override fun afterHookedMethod(param: MethodHookParam) {
                try {
                    if (wasLoaded.get() == true) return
                    val vm = param.thisObject as WidgetUserSetCustomStatusViewModel
                    val state = vm.viewState as? WidgetUserSetCustomStatusViewModel.ViewState.Loaded ?: return
                    if (state.formState.expiration == WidgetUserSetCustomStatusViewModel.FormState.Expiration.TOMORROW) {
                        vm.setExpiration(WidgetUserSetCustomStatusViewModel.FormState.Expiration.NEVER)
                    }
                } catch (e: Throwable) {
                    logger.error("Failed to preselect the forever duration", e)
                }
            }
        })
    }

    private fun isLoaded(vm: Any?): Boolean =
        (vm as? WidgetUserSetCustomStatusViewModel)?.viewState is WidgetUserSetCustomStatusViewModel.ViewState.Loaded

    /** Whether the form was already filled before the current handleStoreState call. */
    private val wasLoaded = ThreadLocal<Boolean>()
}
