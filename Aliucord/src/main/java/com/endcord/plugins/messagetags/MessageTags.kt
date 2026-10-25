/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagetags

import android.content.Context
import androidx.fragment.app.FragmentManager
import com.aliucord.PluginManager
import com.aliucord.Utils
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.discord.models.message.Message
import com.endcord.plugins.actionscommon.BrowserPage
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.actionscommon.ListStore
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R

/** A message with the user's private tags. Mutable fields with defaults so Gson can read it back. */
internal class TaggedMessage(
    var messageId: Long = 0,
    var channelId: Long = 0,
    /** 0 for direct messages. */
    var guildId: Long = 0,
    var author: String = "",
    var content: String = "",
    var tags: ArrayList<String> = ArrayList(),
    var time: Long = 0,
)

internal class MessageTags : EndcordPlugin(
    name = "MessageTags",
    description = "Tag messages with private local labels (TODO, Important, ...) from the message menu, and browse/jump to them with /tagged or from the plugin settings.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility", "organisation")

    val store = ListStore(settings, "tagged", Array<TaggedMessage>::class.java, LIMIT)

    override val settingsSchema = listOf(
        PluginSetting.Action("open", "Open Tagged Messages", "Browse, search and jump to your tagged messages") { open(it) },
        PluginSetting.Text(
            key = "customTags",
            label = "Your tags",
            description = "Extra tags to offer next to TODO, Important, Question and Funny, one per line",
            multiline = true,
        ),
    )

    override fun start(context: Context) {
        store.load()

        MessageActions.register(name, "Tags", R.e.ic_flag_24dp, visible = { !it.message.isLocal }) { ctx ->
            // The sheet is gone by the time an item is picked, so take what's needed from it now
            val fm = ctx.sheet.parentFragmentManager
            val activity = ctx.sheet.requireActivity()
            val message = ctx.message
            val tags = availableTags()
            val current = tagsOf(message.id)
            val labels = tags.map { if (it in current) "✓ $it" else it } + I18n.t("Open Tagged Messages")
            Common.pick(fm, I18n.t("Tags"), labels) { index ->
                if (index < tags.size) toggle(message, tags[index]) else open(activity)
            }
        }

        commands.registerCommand("tagged", "Open your tagged messages") { _ ->
            Common.ui { open(Utils.appActivity) } // the command context may not be an activity
            CommandResult(null, null, false)
        }
    }

    override fun stop(context: Context) {
        store.unload()
        super.stop(context)
    }

    /** The preset tags of Endcord PC plus the user's own. */
    fun availableTags(): List<String> {
        val out = LinkedHashSet(PRESET_TAGS)
        for (tag in list("customTags")) out.add(tag.take(32))
        // Tags that are in use stay pickable even after being removed from the settings
        for (entry in store.all()) out.addAll(entry.tags)
        return out.toList()
    }

    fun tagsOf(messageId: Long): List<String> = store.find { it.messageId == messageId }?.tags ?: emptyList()

    private fun toggle(message: Message, tag: String) {
        val existing = store.find { it.messageId == message.id }
        val tags = ArrayList(existing?.tags ?: emptyList<String>())
        val added = if (tag in tags) {
            tags.remove(tag)
            false
        } else {
            tags.add(tag)
            true
        }
        if (tags.isEmpty()) {
            store.removeIf { it.messageId == message.id }
        } else {
            store.upsert(TaggedMessage(
                messageId = message.id,
                channelId = message.channelId,
                guildId = Common.guildIdOf(message.channelId) ?: 0L,
                author = Common.displayName(message.author),
                content = Common.preview(message),
                tags = tags,
                time = existing?.time ?: System.currentTimeMillis(),
            )) { it.messageId == message.id }
        }
        Utils.showToast(if (added) I18n.t("Tagged as {tag}", "tag" to tag) else I18n.t("Removed tag {tag}", "tag" to tag))
    }

    /** Lets the user change the tags of a stored message, from the browse page. */
    fun editTags(fm: FragmentManager, entry: TaggedMessage, done: () -> Unit) {
        val tags = availableTags()
        val labels = tags.map { if (it in entry.tags) "✓ $it" else it }
        Common.pick(fm, I18n.t("Tags"), labels) { index ->
            val tag = tags[index]
            val newTags = ArrayList(entry.tags)
            if (!newTags.remove(tag)) newTags.add(tag)
            if (newTags.isEmpty()) {
                store.removeIf { it.messageId == entry.messageId }
            } else {
                entry.tags = newTags
                store.upsert(entry) { it.messageId == entry.messageId }
            }
            done()
        }
    }

    private fun open(context: Context) {
        store.load()
        Utils.openPageWithProxy(context, TaggedMessagesPage())
    }

    private companion object {
        const val LIMIT = 1000
        val PRESET_TAGS = listOf("TODO", "Important", "Question", "Funny")
    }
}

internal class TaggedMessagesPage : BrowserPage() {
    private val plugin get() = PluginManager.plugins["MessageTags"] as? MessageTags

    override val pageTitle: String get() = I18n.t("Tagged messages")
    override val emptyText: String get() = I18n.t("No tagged messages yet. Long-press a message and tap Tags.")
    override val filterLabel: String get() = I18n.t("Tag")

    override fun filterOptions(): List<FilterOption> {
        val used = sortedSetOf<String>()
        plugin?.store?.all()?.forEach { used.addAll(it.tags) }
        return used.map { FilterOption(it, it) }
    }

    override fun rows(): List<Row> {
        val plugin = plugin ?: return emptyList()
        return plugin.store.all().map { e ->
            val where = Common.channelTitle(e.channelId)
            val chips = e.tags.joinToString(" ") { "[$it]" }
            Row(
                title = "${e.author} · $where",
                body = "$chips\n${e.content.ifEmpty { I18n.t("(no text)") }}",
                haystack = haystack(e.author, e.content, where, e.tags.joinToString(" ")),
                groups = e.tags,
                actions = listOf(
                    I18n.t("Jump") to { Common.openMessage(requireContext(), e.channelId, e.messageId) },
                    I18n.t("Edit tags") to { plugin.editTags(parentFragmentManager, e) { render() } },
                    I18n.t("Remove") to {
                        plugin.store.removeIf { it.messageId == e.messageId }
                        render()
                    },
                ),
            )
        }
    }
}
