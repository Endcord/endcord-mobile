/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.cancelfriendrequestnc

import android.content.Context
import android.view.View
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.patcher.after
import com.discord.models.domain.ModelUserRelationship
import com.discord.widgets.user.usersheet.WidgetUserSheet
import com.discord.widgets.user.usersheet.WidgetUserSheetViewModel
import com.endcord.plugins.userscommon.Users

internal class CancelFriendRequestNC : EndcordPlugin(
    name = "CancelFriendRequestNC",
    description = "Cancels a pending friend request by clicking the button again.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("friends")

    private val pendingButtonId by lazy { Utils.getResId("user_sheet_pending_friend_request_action_button", "id") }

    override fun start(context: Context) {
        patcher.after<WidgetUserSheet>(
            "configureProfileActionButtons",
            WidgetUserSheetViewModel.ViewState.Loaded::class.java,
        ) { param ->
            try {
                val state = param.args[0] as WidgetUserSheetViewModel.ViewState.Loaded
                if (state.isMe || state.userRelationshipType != ModelUserRelationship.TYPE_INVITE_OUTGOING) return@after
                val button = view?.findViewById<View>(pendingButtonId) ?: return@after
                val userId = state.user.id
                button.isEnabled = true
                button.isClickable = true
                button.setOnClickListener { Users.cancelOutgoingRequest(userId) }
            } catch (e: Throwable) {
                this@CancelFriendRequestNC.logger.error("Failed to patch the pending friend request button", e)
            }
        }
    }
}
