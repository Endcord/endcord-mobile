/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.channelnotes

import android.content.Context
import android.text.InputFilter
import android.text.InputType
import android.view.View
import androidx.fragment.app.FragmentManager
import com.aliucord.PluginManager
import com.aliucord.Utils
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.api.NotificationsAPI
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.NotificationData
import com.aliucord.entities.PluginSetting
import com.aliucord.fragments.InputDialog
import com.aliucord.i18n.I18n
import com.aliucord.utils.RxUtils
import com.aliucord.utils.RxUtils.subscribe
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.discord.stores.StoreStream
import com.endcord.plugins.actionscommon.BrowserPage
import com.endcord.plugins.api.ChannelSheetActions
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.actionscommon.ListStore
import com.lytefast.flexinput.R
import rx.Subscription

/** A private note on a channel. Mutable fields with defaults so Gson can read it back. */
internal class ChannelNote(
    var channelId: Long = 0,
    var text: String = "",
    var updatedAt: Long = 0,
)

internal class ChannelNotes : EndcordPlugin(
    name = "ChannelNotes",
    description = "Keep private notes on any channel, DM or group chat: rules, who is who, things to remember. Notes stay on your device.",
    authors = arrayOf("rootpoi", "kraethis", "ewlle"),
) {
    override val tags = listOf("utility", "chat")

    val store = ListStore(settings, "notes", Array<ChannelNote>::class.java, LIMIT)
    private var selectedSubscription: Subscription? = null
    private val shownThisSession = HashSet<Long>()

    override val settingsSchema = listOf(
        PluginSetting.Action("open", "Open channel notes", "Private notes you added to channels and conversations.") { open(it) },
        PluginSetting.Switch(
            key = "showOnOpen",
            label = "Show notes when opening a channel",
            description = "Shows a channel's note the first time you open it after starting the app",
            default = true,
        ),
    )

    override fun start(context: Context) {
        store.load()

        ChannelSheetActions.register(name, "Add note", R.e.ic_edit_24dp, visible = { noteFor(it.channel.id) == null }) { ctx ->
            edit(ctx.sheet.parentFragmentManager, ctx.channel.id)
        }
        ChannelSheetActions.register(name, "Edit note", R.e.ic_edit_24dp, visible = { noteFor(it.channel.id) != null }) { ctx ->
            edit(ctx.sheet.parentFragmentManager, ctx.channel.id)
        }

        commands.registerCommand("notes", "Open your channel notes") { _ ->
            Common.ui { open(Utils.appActivity) } // the command context may not be an activity
            CommandResult(null, null, false)
        }

        selectedSubscription = StoreStream.getChannelsSelected().observeId().subscribe(
            RxUtils.createActionSubscriber<Long>({ id -> if (id != null) Common.ui { onChannelOpened(id) } }),
        )
    }

    override fun stop(context: Context) {
        selectedSubscription?.unsubscribe()
        selectedSubscription = null
        shownThisSession.clear()
        ChannelSheetActions.unregisterAll(name)
        store.unload()
        super.stop(context)
    }

    fun noteFor(channelId: Long): ChannelNote? = store.find { it.channelId == channelId }

    private fun onChannelOpened(channelId: Long) {
        if (channelId <= 0L || !bool("showOnOpen") || !shownThisSession.add(channelId)) return
        val note = noteFor(channelId) ?: return
        NotificationsAPI.display(
            NotificationData()
                .setTitle(I18n.t("Note for {channel}", "channel" to Common.channelTitle(channelId)))
                .setBody(Common.preview(note.text, 280))
                .setAutoDismissPeriodSecs(8)
                .setOnClick { _: View -> edit(Utils.appActivity.supportFragmentManager, channelId) },
        )
    }

    /** Opens the note editor for [channelId]. Saving an empty note deletes it. */
    fun edit(fm: FragmentManager, channelId: Long, onDone: () -> Unit = {}) {
        val existing = noteFor(channelId)
        val isGuild = Common.guildIdOf(channelId) != null
        val dialog = InputDialog()
            .setTitle(I18n.t(if (existing != null) "Edit note" else "Add a note"))
            .setDescription(
                I18n.t("Only you can see this note for {channel}.", "channel" to Common.channelTitle(channelId)) +
                    "\n" + I18n.t("Save it empty to delete the note."),
            )
            .setPlaceholderText(I18n.t(if (isGuild) "Server rules, who is who, things to remember…" else "Things to remember about this conversation…"))
            .setInputType(InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES)
        dialog.setOnDialogShownListener {
            dialog.inputLayout.editText?.run {
                filters = arrayOf(InputFilter.LengthFilter(MAX_LENGTH))
                maxLines = 10
                if (existing != null) {
                    setText(existing.text)
                    setSelection(text.length)
                }
            }
        }
        dialog.setOnOkListener {
            save(channelId, dialog.input)
            dialog.dismiss()
            onDone()
        }
        dialog.show(fm, "ChannelNote")
    }

    fun save(channelId: Long, text: String) {
        val trimmed = text.trim().take(MAX_LENGTH)
        if (trimmed.isEmpty()) {
            store.removeIf { it.channelId == channelId }
            Utils.showToast(I18n.t("Note deleted"))
        } else {
            store.upsert(ChannelNote(channelId, trimmed, System.currentTimeMillis())) { it.channelId == channelId }
            Utils.showToast(I18n.t("Note saved"))
        }
    }

    private fun open(context: Context) {
        store.load()
        Utils.openPageWithProxy(context, ChannelNotesPage())
    }

    private companion object {
        const val LIMIT = 300
        const val MAX_LENGTH = 4000
    }
}

internal class ChannelNotesPage : BrowserPage() {
    private val plugin get() = PluginManager.plugins["ChannelNotes"] as? ChannelNotes

    override val pageTitle: String get() = I18n.t("Channel notes")
    override val emptyText: String get() = I18n.t("No notes yet. Long-press a channel or conversation and choose Add note.")
    override val searchHint: String get() = I18n.t("Search notes")

    override fun rows(): List<Row> {
        val plugin = plugin ?: return emptyList()
        return plugin.store.all().map { note ->
            val title = Common.channelTitle(note.channelId)
            Row(
                title = title,
                body = "${note.text}\n${Common.formatTime(note.updatedAt)}",
                haystack = haystack(title, note.text),
                actions = listOf(
                    I18n.t("Open channel") to { Common.openMessage(requireContext(), note.channelId, null) },
                    I18n.t("Edit") to { plugin.edit(parentFragmentManager, note.channelId) { render() } },
                    I18n.t("Delete note") to {
                        plugin.save(note.channelId, "")
                        render()
                    },
                ),
            )
        }
    }
}
