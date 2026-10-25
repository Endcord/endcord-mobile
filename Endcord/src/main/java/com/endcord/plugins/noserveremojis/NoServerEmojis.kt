/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.noserveremojis

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.after
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.discord.models.domain.emoji.ModelEmojiCustom
import com.discord.stores.StoreStream
import com.discord.widgets.chat.input.autocomplete.AutocompleteModelUtils
import com.discord.widgets.chat.input.autocomplete.EmojiAutocompletable
import com.discord.widgets.chat.input.autocomplete.LeadingIdentifier
import com.discord.widgets.chat.input.models.InputSelectionModel
import com.discord.widgets.chat.input.models.MentionToken

internal class NoServerEmojis : EndcordPlugin(
    name = "NoServerEmojis",
    description = "Do not show server emojis in the autocomplete menu.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("emotes", "servers")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            key = "shownEmojis",
            label = "The types of emojis to show in the autocomplete menu.",
            options = listOf(
                PluginSetting.Choice.Option("onlyUnicode", "Only unicode emojis"),
                PluginSetting.Choice.Option("currentServer", "Unicode emojis and server emojis from current server"),
                PluginSetting.Choice.Option("all", "Unicode emojis and all server emojis (Discord default)"),
            ),
        ),
    )

    override fun start(context: Context) {
        // The matches for what is being typed, before Discord cuts them down to the few it shows. Filtering here
        // only changes the suggestions: typing a server emoji's :name: in full still turns it into the emoji.
        patcher.after<AutocompleteModelUtils>(
            "filterMentionsFromToken",
            MentionToken::class.java,
            InputSelectionModel::class.java,
            Map::class.java,
        ) { param ->
            try {
                val token = param.args[0] as MentionToken? ?: return@after
                if (token.leadingIdentifier != LeadingIdentifier.EMOJI_AND_STICKERS) return@after
                val mode = choice("shownEmojis")
                if (mode == "all") return@after
                val results = param.result as? List<*> ?: return@after

                val guildId = if (mode == "currentServer") currentGuildId() else 0L
                val filtered = results.filter { item ->
                    val emoji = (item as? EmojiAutocompletable)?.emoji as? ModelEmojiCustom ?: return@filter true
                    mode == "currentServer" && guildId != 0L && emoji.guildId == guildId
                }
                if (filtered.size != results.size) param.result = filtered
            } catch (e: Throwable) {
                logger.error("Failed to filter emoji suggestions", e)
            }
        }
    }

    /** The server of the channel the chat input belongs to, 0 in DMs. */
    private fun currentGuildId(): Long = try {
        val channelId = StoreStream.getChannelsSelected().id
        StoreStream.getChannels().getChannel(channelId)?.guildId ?: 0L
    } catch (e: Throwable) {
        0L
    }
}
