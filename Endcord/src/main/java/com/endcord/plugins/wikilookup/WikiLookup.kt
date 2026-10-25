/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.wikilookup

import android.content.Context
import com.aliucord.api.CommandsAPI
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.tr
import com.endcord.plugins.commandscommon.Net

internal class WikiLookup : EndcordPlugin(
    name = "WikiLookup",
    description = "/wiki pulls a short Wikipedia summary for anything (sent only to you).",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility", "commands")

    override fun start(context: Context) {
        commands.registerCommand("wiki", "Look up a Wikipedia summary", CommandsAPI.requiredMessageOption) { ctx ->
            val query = ctx.getRequiredString("message").trim()
            if (query.isEmpty()) null else CommandResult(lookup(query), null, false)
        }
    }

    /** Runs on the command thread, so blocking on the network is fine. */
    private fun lookup(query: String): String {
        val title = Net.encodeURIComponent(query)
        val data = try {
            Net.getObject("https://en.wikipedia.org/api/rest_v1/page/summary/$title")
        } catch (e: Net.HttpError) {
            return if (e.status == 404) tr("No Wikipedia article found for **{query}**.", "query" to query)
            else tr("Couldn't reach Wikipedia right now.")
        } catch (e: Throwable) {
            logger.warn("Wikipedia lookup failed", e)
            return tr("Couldn't reach Wikipedia right now.")
        }

        val extract = data.optString("extract")
        if (data.optString("type") == "disambiguation" || extract.isEmpty()) {
            return tr("**{query}** is ambiguous — try being more specific.", "query" to query)
        }
        val url = data.optJSONObject("content_urls")?.optJSONObject("desktop")?.optString("page")
            ?.takeIf { it.isNotEmpty() }
            ?: "https://en.wikipedia.org/wiki/$title"
        return "📚 **${data.optString("title", query)}**\n$extract\n<$url>"
    }
}
