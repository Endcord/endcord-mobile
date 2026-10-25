/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.cancelfriendrequest

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.discord.models.domain.ModelUserRelationship
import com.endcord.plugins.api.UserSheetActions
import com.endcord.plugins.userscommon.Users
import com.lytefast.flexinput.R

internal class CancelFriendRequest : EndcordPlugin(
    name = "CancelFriendRequest",
    description = "Adds a way to cancel outgoing friend requests from profiles.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("friends", "utility")

    override fun start(context: Context) {
        UserSheetActions.register(
            name,
            "Cancel Outgoing Friend Request",
            R.e.ic_user_actions_remove_friend_white_a60_24dp,
            visible = { !it.state.isMe && it.state.userRelationshipType == ModelUserRelationship.TYPE_INVITE_OUTGOING },
        ) { ctx ->
            Users.cancelOutgoingRequest(ctx.user.id)
        }
    }
}
