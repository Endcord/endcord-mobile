/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.guildscommon

import android.content.Context
import com.aliucord.entities.EndcordPlugin

/** Base class of this batch's plugins: also removes what they registered with the shared server/channel list hooks. */
internal abstract class GuildsPlugin(
    name: String,
    description: String,
    authors: Array<String> = arrayOf("ewlle", "kraethis"),
) : EndcordPlugin(name, description, authors) {
    override fun stop(context: Context) {
        super.stop(context)
        ChannelListHooks.unregisterAll(name)
        GuildListHooks.unregisterAll(name)
        GuildMenuActions.unregisterAll(name)
    }

    /** An ordered list of IDs saved in this plugin's settings under [key]. */
    protected fun ids(key: String): MutableList<Long> =
        (settings.getString(key, "") ?: "").split(',').mapNotNullTo(ArrayList()) { it.trim().toLongOrNull() }

    protected fun saveIds(key: String, ids: List<Long>) {
        settings.setString(key, ids.joinToString(","))
    }
}
