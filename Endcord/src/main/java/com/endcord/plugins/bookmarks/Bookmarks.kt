/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.bookmarks

import android.content.Context
import com.aliucord.PluginManager
import com.aliucord.Utils
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.endcord.plugins.actionscommon.BrowserPage
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.actionscommon.ListStore
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R

/** A bookmarked message. Mutable fields with defaults so Gson can read it back. */
internal class Bookmark(
    var messageId: Long = 0,
    var channelId: Long = 0,
    /** 0 for direct messages. */
    var guildId: Long = 0,
    var author: String = "",
    var content: String = "",
    var time: Long = 0,
)

internal class Bookmarks : EndcordPlugin(
    name = "Bookmarks",
    description = "Privately bookmark messages (beyond Discord's 50-pin limit) from the message menu, then view and jump to them with /bookmarks or from the plugin settings.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility", "chat")

    val store = ListStore(settings, "bookmarks", Array<Bookmark>::class.java, LIMIT)

    override val settingsSchema = listOf(
        PluginSetting.Action("open", "Open Bookmarks", "Browse, search and jump to your bookmarks") { open(it) },
    )

    override fun start(context: Context) {
        store.load()

        MessageActions.register(
            name,
            "Bookmark",
            R.e.ic_star_24dp,
            visible = { ctx -> !ctx.message.isLocal && !isBookmarked(ctx.message.id) },
        ) { ctx ->
            val message = ctx.message
            store.add(Bookmark(
                messageId = message.id,
                channelId = message.channelId,
                guildId = Common.guildIdOf(message.channelId) ?: 0L,
                author = Common.displayName(message.author),
                content = Common.preview(message),
                time = System.currentTimeMillis(),
            ))
            Utils.showToast(I18n.t("Bookmarked"))
        }
        MessageActions.register(
            name,
            "Remove Bookmark",
            R.e.ic_star_24dp,
            visible = { ctx -> isBookmarked(ctx.message.id) },
        ) { ctx ->
            val id = ctx.message.id
            store.removeIf { it.messageId == id }
        }

        commands.registerCommand("bookmarks", "Open your bookmarks") { _ ->
            Common.ui { open(Utils.appActivity) } // the command context may not be an activity
            CommandResult(null, null, false)
        }
    }

    override fun stop(context: Context) {
        store.unload()
        super.stop(context)
    }

    private fun isBookmarked(id: Long) = store.any { it.messageId == id }

    private fun open(context: Context) {
        store.load()
        Utils.openPageWithProxy(context, BookmarksPage())
    }

    private companion object {
        const val LIMIT = 1000
    }
}

internal class BookmarksPage : BrowserPage() {
    private val plugin get() = PluginManager.plugins["Bookmarks"] as? Bookmarks

    override val pageTitle: String get() = I18n.t("Bookmarks")
    override val emptyText: String get() = I18n.t("No bookmarks yet. Long-press a message and tap Bookmark.")
    override val filterLabel: String get() = I18n.t("Server")

    override fun filterOptions(): List<FilterOption> {
        val keys = LinkedHashSet<Long>()
        plugin?.store?.all()?.forEach { keys.add(it.guildId) }
        return keys.map { FilterOption(it.toString(), Common.guildTitle(it)) }
    }

    override fun rows(): List<Row> {
        val store = plugin?.store ?: return emptyList()
        return store.all().map { b ->
            val where = Common.channelTitle(b.channelId)
            val text = b.content.ifEmpty { I18n.t("(no text)") }
            Row(
                title = "${b.author} · $where",
                body = "$text\n${Common.formatTime(b.time)}",
                haystack = haystack(b.author, b.content, where),
                groups = listOf(b.guildId.toString()),
                actions = listOf(
                    I18n.t("Jump") to { Common.openMessage(requireContext(), b.channelId, b.messageId) },
                    I18n.t("Copy Message Link") to { Common.copy(Common.messageLink(b.channelId, b.messageId)) },
                    I18n.t("Remove") to {
                        store.removeIf { it.messageId == b.messageId }
                        render()
                    },
                ),
            )
        }
    }
}
