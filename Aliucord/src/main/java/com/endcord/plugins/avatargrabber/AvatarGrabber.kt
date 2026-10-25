/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.avatargrabber

import android.content.Context
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.tr
import com.endcord.plugins.commandscommon.Avatars
import com.endcord.plugins.commandscommon.Options

internal class AvatarGrabber : EndcordPlugin(
    name = "AvatarGrabber",
    description = "/avatar grabs the full-resolution avatar of any user (or yourself).",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility", "commands")

    override fun start(context: Context) {
        commands.registerCommand(
            "avatar",
            "Get a user's full-size avatar",
            listOf(Options.user("user", "Whose avatar (defaults to you)")),
        ) { ctx ->
            val userId = ctx.getLong("user") ?: ctx.me.id
            // Users that aren't cached (for example a pasted id) are fetched from the API
            val owner = Avatars.findUser(userId)
            if (owner == null) CommandResult(tr("Couldn't find that user."), null, false)
            else CommandResult(Avatars.url(owner, 1024), null, true)
        }
    }
}
