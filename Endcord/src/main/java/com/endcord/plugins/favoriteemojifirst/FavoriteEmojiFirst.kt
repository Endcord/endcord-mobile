/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.favoriteemojifirst

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.patcher.after
import com.discord.stores.StoreMediaFavorites
import com.discord.stores.StoreStream
import com.discord.widgets.chat.input.autocomplete.AutocompleteModelUtils
import com.discord.widgets.chat.input.autocomplete.EmojiAutocompletable
import com.discord.widgets.chat.input.autocomplete.LeadingIdentifier
import com.discord.widgets.chat.input.models.InputSelectionModel
import com.discord.widgets.chat.input.models.MentionToken
import java.lang.reflect.Field
import java.lang.reflect.Method

internal class FavoriteEmojiFirst : EndcordPlugin(
    name = "FavoriteEmojiFirst",
    description = "Puts your favorite emoji first in the emoji autocomplete.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("emotes", "customisation")

    override fun start(context: Context) {
        // These are all the matches for what is being typed; Discord only keeps the first few of them afterwards,
        // so moving the favorites up front here also lets favorites further down the list make the cut, like on PC.
        patcher.after<AutocompleteModelUtils>(
            "filterMentionsFromToken",
            MentionToken::class.java,
            InputSelectionModel::class.java,
            Map::class.java,
        ) { param ->
            try {
                val token = param.args[0] as MentionToken? ?: return@after
                if (token.leadingIdentifier != LeadingIdentifier.EMOJI_AND_STICKERS) return@after
                val results = param.result as? List<*> ?: return@after
                if (results.size < 2) return@after
                val favorites = favoriteIds()
                if (favorites.isEmpty()) return@after

                val first = ArrayList<Any?>(results.size)
                val rest = ArrayList<Any?>(results.size)
                for (item in results) {
                    val id = (item as? EmojiAutocompletable)?.emoji?.uniqueId
                    if (id != null && id in favorites) first += item else rest += item
                }
                if (first.isEmpty() || rest.isEmpty()) return@after
                first.addAll(rest)
                param.result = first
            } catch (e: Throwable) {
                logger.error("Failed to sort emoji suggestions", e)
            }
        }
    }

    /** Unique ids of the emojis the user favorited in the emoji picker. */
    private fun favoriteIds(): Set<String> {
        val snapshot = favoritesSnapshot[getMediaFavorites.invoke(StoreStream.Companion)] as? Set<*> ?: return emptySet()
        val ids = HashSet<String>(snapshot.size)
        for (favorite in snapshot) {
            if (favorite is StoreMediaFavorites.FavoriteEmoji) ids += favorite.emojiUniqueId ?: continue
        }
        return ids
    }

    private companion object {
        // Kotlin can't see this companion getter (its metadata is stripped), so call it reflectively
        val getMediaFavorites: Method by lazy {
            StoreStream.Companion::class.java.getDeclaredMethod("getMediaFavorites")
        }
        val favoritesSnapshot: Field by lazy {
            StoreMediaFavorites::class.java.getDeclaredField("favoritesSnapshot").apply { isAccessible = true }
        }
    }
}
