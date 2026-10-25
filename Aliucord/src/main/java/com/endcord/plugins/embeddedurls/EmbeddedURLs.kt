/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.embeddedurls

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.messagesbcommon.SendHooks
import java.util.Locale
import java.util.regex.Pattern

internal class EmbeddedURLs : EndcordPlugin(
    name = "EmbeddedURLs",
    description = "Turns plain social links into embeddable URLs so posts and videos are fully viewable in Discord " +
        "instead of forcing users to open the external site.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    /** Rewrites every link to one of the [ORIGINS] in [content], keeping path and query like Endcord PC. */
    private fun rewrite(content: String): String {
        if (content.indexOf("https://") < 0) return content
        val matcher = URL.matcher(content)
        var out: StringBuilder? = null
        var last = 0
        while (matcher.find()) {
            val origin = matcher.group(1) ?: continue
            val replacement = ORIGINS[origin.lowercase(Locale.ROOT)] ?: continue
            // Links with a port or other unusual parts are left alone
            if (matcher.end() < content.length && content[matcher.end()] == ':') continue
            // Endcord PC rebuilds the link from origin + path + query, dropping any #fragment
            var rest = matcher.group(2) ?: ""
            val hash = rest.indexOf('#')
            if (hash >= 0) rest = rest.substring(0, hash)
            if (rest.isEmpty() || rest[0] != '/') rest = "/$rest"

            val builder = out ?: StringBuilder(content.length + 16).also { out = it }
            builder.append(content, last, matcher.start()).append(replacement).append(rest)
            last = matcher.end()
        }
        val builder = out ?: return content
        return builder.append(content, last, content.length).toString()
    }

    override fun start(context: Context) {
        SendHooks.register(name, onEdit = false, transform = ::rewrite)
    }

    override fun stop(context: Context) {
        SendHooks.unregisterAll(name)
        super.stop(context)
    }

    private companion object {
        /** Group 1 is the origin, group 2 everything after it. */
        val URL: Pattern = Pattern.compile("(https://[A-Za-z0-9.-]+)([/?#][^\\s<>]*)?")

        val ORIGINS = mapOf(
            "https://www.tiktok.com" to "https://www.tnktok.com",
            "https://tiktok.com" to "https://www.tnktok.com",
            "https://vt.tiktok.com" to "https://www.tnktok.com",
            "https://x.com" to "https://www.fxtwitter.com",
            "https://www.twitter.com" to "https://www.fxtwitter.com",
            "https://twitter.com" to "https://www.fxtwitter.com",
            "https://www.instagram.com" to "https://www.kkinstagram.com",
            "https://instagram.com" to "https://www.kkinstagram.com",
        )
    }
}
