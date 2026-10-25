/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.guildsbcommon

import android.content.Context
import com.endcord.plugins.guildscommon.GuildsPlugin

/**
 * Base class of this batch's plugins: on top of [GuildsPlugin] (shared server and channel list hooks) it also
 * removes the plugin's [TypingState] listeners and [ThreadRowHooks] decorators when it stops.
 */
internal abstract class GuildsBPlugin(
    name: String,
    description: String,
    authors: Array<String> = arrayOf("ewlle", "kraethis"),
) : GuildsPlugin(name, description, authors) {
    override fun stop(context: Context) {
        super.stop(context)
        TypingState.unregisterAll(name)
        ThreadRowHooks.unregisterAll(name)
    }
}
