/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.profilemedia

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.discord.models.user.CoreUser
import com.discord.models.user.User
import com.endcord.plugins.api.UserSheetActions
import com.endcord.plugins.translatecommon.Downloads
import com.endcord.plugins.translatecommon.Media
import com.lytefast.flexinput.R

/** Endcord PC's user context menu entries, at the bottom of the user profile sheet. */
internal class ProfileMedia : EndcordPlugin(
    name = "ProfileMedia",
    description = DESCRIPTION,
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("media", "appearance")

    override fun start(context: Context) {
        UserSheetActions.register(name, "View Avatar", R.e.ic_gallery_24dp) { ctx ->
            Media.open(Media.avatarUrl(ctx.user), "avatar_${fileName(ctx.user)}")
        }
        UserSheetActions.register(name, "Download Avatar", R.e.ic_file_download_white_24dp) { ctx ->
            Media.save(Media.avatarUrl(ctx.user), "avatar_${fileName(ctx.user)}")
        }
        UserSheetActions.register(name, "View Banner", R.e.ic_gallery_24dp, visible = { banner(it) != null }) { ctx ->
            banner(ctx)?.let { Media.open(it, "banner_${fileName(ctx.user)}") }
        }
        UserSheetActions.register(name, "Download Banner", R.e.ic_file_download_white_24dp, visible = { banner(it) != null }) { ctx ->
            banner(ctx)?.let { Media.save(it, "banner_${fileName(ctx.user)}") }
        }
    }

    /** The user's banner: the cached user only has it once their profile was fetched, which the sheet does. */
    private fun banner(ctx: UserSheetActions.Context): String? {
        val hash = ctx.user.banner ?: ctx.state.userProfile?.g()?.let { CoreUser(it).banner }
        return Media.bannerUrl(ctx.user.id, hash)
    }

    private fun fileName(user: User) = Downloads.safeName(user.username ?: user.id.toString())

    private companion object {
        const val DESCRIPTION = "View and download user avatars and banners in full resolution from the user profile sheet."
    }
}
