/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.copystatusurls

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.utils.RxUtils.await
import com.discord.api.activity.Activity
import com.discord.utilities.rest.RestAPI
import com.discord.widgets.user.presence.ViewHolderUserRichPresence
import com.endcord.plugins.actionscommon.Common
import com.discord.models.user.User as ModelUser

internal class CopyStatusUrls : EndcordPlugin(
    name = "CopyStatusUrls",
    description = "Copy a user's status URL when you long-press it",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("activity", "utility")

    override fun start(context: Context) {
        // The buttons of a rich presence (Watch, Listen, Visit...) on the user sheet
        patcher.after<ViewHolderUserRichPresence>(
            "configureCustomButtonsUi",
            ModelUser::class.java,
            Activity::class.java,
            Context::class.java,
        ) { param ->
            val user = param.args[0] as? ModelUser
            val activity = param.args[1] as? Activity
            val labels = activity?.c().orEmpty() // custom button labels
            listOf(richPresencePrimaryButton, richPresenceSecondaryButton).forEachIndexed { index, button ->
                if (button == null) return@forEachIndexed
                if (user == null || activity == null || index >= labels.size) {
                    button.setOnLongClickListener(null)
                } else {
                    val userId = user.id
                    button.setOnLongClickListener {
                        copyUrl(userId, activity, index)
                        true
                    }
                }
            }
        }
    }

    /** Button links aren't part of the presence, Discord hands them out on request like Endcord PC does. */
    private fun copyUrl(userId: Long, activity: Activity, index: Int) {
        val sessionId = activity.k() ?: return failed(null)
        val applicationId = activity.a() ?: return failed(null)
        Utils.threadPool.execute {
            val (metadata, error) = RestAPI.getApi().getActivityMetadata(userId, sessionId, applicationId).await()
            val url = metadata?.b()?.getOrNull(index) // button urls
            if (url.isNullOrEmpty()) failed(error) else Common.ui { Common.copy(url, "Copied URL") }
        }
    }

    private fun failed(error: Throwable?) {
        if (error != null) logger.error("Failed to get the button link", error)
        Utils.showToast(I18n.t("Couldn't get this button's link."))
    }
}
