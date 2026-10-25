/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.forceownercrown

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.patcher.instead
import com.discord.stores.StoreChannelMembers

/**
 * The app hides the owner crown in a server's member list as soon as the server has a hoisted role with the
 * Administrator permission (`StoreChannelMembers.allowOwnerIndicator`). This always allows it; the crown is
 * still only shown next to the actual owner.
 */
internal class ForceOwnerCrown : EndcordPlugin(
    name = "ForceOwnerCrown",
    description = "Force the owner crown next to usernames even if the server is large.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("roles", "appearance", "servers")

    override fun start(context: Context) {
        patcher.instead<StoreChannelMembers>("allowOwnerIndicator", Long::class.javaPrimitiveType!!) { true }
    }
}
