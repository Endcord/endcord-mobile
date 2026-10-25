/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.husk

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.GuildEmojiWrapper.Companion.id
import com.aliucord.wrappers.GuildEmojiWrapper.Companion.name
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.notifycommon.Reactions
import com.discord.stores.StoreStream
import com.lytefast.flexinput.R

internal class Husk : EndcordPlugin(
    name = "Husk",
    description = "Adds Husk button (check settings to change used emoji)",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("emotes", "fun")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            "findInServer",
            "Find in server",
            "Attempt to find emoji of same name in server before using ID in settings (useful if no nitro)",
            true,
        ),
        PluginSetting.Text("emojiName", "Emoji name", "Emoji name (default (from Endcord Server): husk)", default = "husk"),
        PluginSetting.Text("emojiID", "Emoji ID", "Emoji ID (default (from Endcord Server): 1026532993923293184)", default = DEFAULT_ID),
    )

    override fun start(context: Context) {
        MessageActions.register(name, "Husk", R.e.ic_add_reaction_grey_a60_24dp) { ctx ->
            val message = ctx.message
            val emojiName = string("emojiName").trim().ifEmpty { "husk" }
            val emojiId = emojiIdFor(Common.guildIdOf(message.channelId), emojiName)
            if (emojiId == null) {
                Utils.showToast(I18n.t("Set a valid emoji ID in the Husk settings"))
                return@register
            }
            Reactions.add(message.channelId, message.id, "$emojiName:$emojiId") { ok ->
                if (!ok) Utils.mainThread.post { Utils.showToast(I18n.t("Couldn't add the reaction")) }
            }
        }
    }

    private fun emojiIdFor(guildId: Long?, emojiName: String): Long? {
        if (bool("findInServer") && guildId != null) {
            StoreStream.getGuilds().getGuild(guildId)?.emojis?.firstOrNull { it.name == emojiName }?.let { return it.id }
        }
        return string("emojiID").trim().ifEmpty { DEFAULT_ID }.toLongOrNull()
    }

    private companion object {
        const val DEFAULT_ID = "1026532993923293184"
    }
}
