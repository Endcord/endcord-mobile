/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.plainfoldericon

import android.content.Context
import android.content.res.ColorStateList
import android.view.View
import androidx.core.widget.ImageViewCompat
import com.aliucord.entities.EndcordPlugin
import com.aliucord.patcher.after
import com.discord.databinding.WidgetGuildsListItemFolderBinding
import com.discord.utilities.color.ColorCompat
import com.discord.views.ServerFolderView
import com.discord.widgets.guilds.list.GuildListItem
import com.discord.widgets.guilds.list.GuildListViewHolder
import com.lytefast.flexinput.R
import java.lang.reflect.Field

internal class PlainFolderIcon : EndcordPlugin(
    name = "PlainFolderIcon",
    description = "Dont show the small guild icons in folders",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "customisation")

    override fun start(context: Context) {
        // ServerFolderView shows the folder icon (k.b) while the folder is open (m) and the grid of four server
        // icons (k.g) while it is closed. a() applies that, directly or once the open/close animation ends.
        patcher.after<ServerFolderView>("a") {
            try {
                if (!m) showPlainIcon(this)
            } catch (e: Throwable) {
                logger.error("Failed to update a server folder", e)
            }
        }

        // Discord only tints the folder icon with the folder color when it opens it, so tint it for closed
        // folders too (rows are recycled, the tint could belong to another folder otherwise).
        patcher.after<GuildListViewHolder.FolderViewHolder>("configure", GuildListItem.FolderItem::class.java) { param ->
            try {
                val item = param.args[0] as GuildListItem.FolderItem? ?: return@after
                if (item.isOpen || item.isPendingGuildsFolder) return@after
                val folder = (bindingField[this] as WidgetGuildsListItemFolderBinding?)?.b ?: return@after
                showPlainIcon(folder)
                val color = item.color?.let { it or 0xFF000000.toInt() }
                    ?: ColorCompat.getThemedColor(folder.context, R.b.color_brand_500)
                ImageViewCompat.setImageTintList(folder.k.b, ColorStateList.valueOf(color))
            } catch (e: Throwable) {
                logger.error("Failed to configure a server folder", e)
            }
        }
    }

    private fun showPlainIcon(folder: ServerFolderView) {
        folder.k.b.visibility = View.VISIBLE
        folder.k.g.visibility = View.GONE
    }

    private companion object {
        val bindingField: Field by lazy {
            GuildListViewHolder.FolderViewHolder::class.java.getDeclaredField("binding").apply { isAccessible = true }
        }
    }
}
