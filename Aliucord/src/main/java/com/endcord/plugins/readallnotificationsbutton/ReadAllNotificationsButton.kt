/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.readallnotificationsbutton

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.utils.RxUtils.await
import com.discord.stores.StoreStream
import com.discord.utilities.rest.RestAPI
import com.discord.widgets.guilds.list.GuildListItem
import com.discord.widgets.guilds.list.GuildListViewHolder
import com.endcord.plugins.guildscommon.GuildsPlugin
import com.endcord.plugins.guildscommon.Rx

internal class ReadAllNotificationsButton : GuildsPlugin(
    name = "ReadAllNotificationsButton",
    description = "Read all server notifications by long-pressing the home button above your servers",
) {
    override val tags = listOf("notifications", "shortcuts")

    override val settingsSchema = listOf(
        PluginSetting.Action("readAll", "Read All", "Mark every server as read now") { readAll() },
    )

    @Volatile private var running = false
    @Volatile private var enabled = false

    override fun start(context: Context) {
        enabled = true
        patcher.after<GuildListViewHolder.FriendsViewHolder>("configure", GuildListItem.FriendsItem::class.java) {
            itemView.setOnLongClickListener {
                if (!enabled) return@setOnLongClickListener false
                readAll()
                true
            }
        }
    }

    override fun stop(context: Context) {
        enabled = false
        super.stop(context)
    }

    /** Marks every unread server as read, the same way Discord's own "Mark As Read" does for one server. */
    private fun readAll() {
        if (running) return
        running = true
        Utils.showToast(I18n.t("Marking all servers as read..."))
        Utils.threadPool.execute {
            var count = 0
            try {
                val unread = Rx.first(StoreStream.getReadStates().unreadGuildIds) ?: emptySet()
                for (guildId in unread) {
                    val error = RestAPI.api.ackGuild(guildId).await().second
                    if (error != null) logger.error("Failed to mark server $guildId as read", error) else count++
                    Thread.sleep(200)
                }
                Utils.showToast(I18n.t("Marked {count} servers as read", "count" to count))
            } catch (e: Throwable) {
                logger.errorToast(I18n.t("Failed to mark servers as read"), e)
            } finally {
                running = false
            }
        }
    }
}
