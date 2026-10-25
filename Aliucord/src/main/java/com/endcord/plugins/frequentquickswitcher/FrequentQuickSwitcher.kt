/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.frequentquickswitcher

import android.content.Context
import com.aliucord.patcher.after
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.discord.api.channel.ChannelUtils
import com.discord.widgets.user.search.WidgetGlobalSearchGuildsModel
import com.discord.widgets.user.search.WidgetGlobalSearchModel
import com.endcord.plugins.guildsbcommon.GuildsBPlugin
import kotlin.jvm.functions.Function1

/**
 * The quick switcher (search button above the channel list) builds its results in `WidgetGlobalSearchModel.create`.
 * When you type a search, the results are filtered to the channels Discord's own frecency tracker counts as your
 * most used ones (`SearchContext.frecencyChannels`), most used first, at most 20, like Endcord PC. Searches for
 * users (`@`) or servers (`*`) are left alone, and so are searches none of your frequent channels match.
 */
internal class FrequentQuickSwitcher : GuildsBPlugin(
    name = "FrequentQuickSwitcher",
    description = "Rewrites and filters the quick switcher results to be your most frequent channels",
) {
    override val tags = listOf("shortcuts", "servers")

    override fun start(context: Context) {
        patcher.after<WidgetGlobalSearchModel.Companion>(
            "create",
            WidgetGlobalSearchModel.SearchContext::class.java,
            WidgetGlobalSearchModel.UsersContext::class.java,
            WidgetGlobalSearchModel.ChannelContext::class.java,
            WidgetGlobalSearchGuildsModel::class.java,
            Function1::class.java,
            Function1::class.java,
        ) { param ->
            try {
                val search = param.args[0] as WidgetGlobalSearchModel.SearchContext
                val model = param.result as? WidgetGlobalSearchModel ?: return@after
                rewrite(search, model)?.let { param.result = it }
            } catch (e: Throwable) {
                logger.error("Failed to rewrite the quick switcher results", e)
            }
        }
    }

    private fun rewrite(search: WidgetGlobalSearchModel.SearchContext, model: WidgetGlobalSearchModel): WidgetGlobalSearchModel? {
        val type = search.searchType
        if (type == WidgetGlobalSearchModel.SEARCH_TYPE_USER || type == WidgetGlobalSearchModel.SEARCH_TYPE_GUILD) return null
        val query = search.sanitizedFilter?.trim().orEmpty()
        if (query.isEmpty()) return null // the empty switcher already lists your recent and frequent channels

        val rank = HashMap<Long, Int>()
        for ((index, id) in search.frecencyChannels.withIndex()) rank[id] = index
        if (rank.isEmpty()) return null

        val channels = model.data
            .filterIsInstance<WidgetGlobalSearchModel.ItemChannel>()
            .filter { item ->
                val channel = item.channel
                channel != null && rank.containsKey(channel.id) && ChannelUtils.c(channel).contains(query, ignoreCase = true)
            }
            .sortedBy { rank[it.channel.id] ?: Int.MAX_VALUE }
            .take(MAX_RESULTS)
        if (channels.isEmpty()) return null
        return WidgetGlobalSearchModel(model.filter, model.searchType, channels, model.guildsList)
    }

    private companion object {
        const val MAX_RESULTS = 20
    }
}
