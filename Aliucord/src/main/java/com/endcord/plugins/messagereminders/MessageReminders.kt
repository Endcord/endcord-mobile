/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagereminders

import android.content.Context
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
import java.util.Calendar

/** A reminder about a message. Mutable fields with defaults so Gson can read it back. */
internal class Reminder(
    var id: String = "",
    var messageId: Long = 0,
    var channelId: Long = 0,
    var author: String = "",
    var content: String = "",
    var remindAt: Long = 0,
)

internal class MessageReminders : EndcordPlugin(
    name = "MessageReminders",
    description = "Long-press a message to be reminded about it later. A notification brings you right back to it.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility", "chat")

    val store = ListStore(settings, "reminders", Array<Reminder>::class.java, LIMIT)
    private var scheduler: ReminderScheduler? = null

    override val settingsSchema = listOf(
        PluginSetting.Action("open", "Open Reminders", "See and cancel the reminders you set") { open(it) },
    )

    override fun start(context: Context) {
        store.load()
        scheduler = ReminderScheduler(this).also { it.start() }

        MessageActions.register(name, "Remind me", R.e.ic_clock_24dp, visible = { !it.message.isLocal }) { ctx ->
            val message = ctx.message
            val labels = PRESETS.map { I18n.t(it.first) } + I18n.t("Open Reminders")
            Common.pick(ctx.sheet.parentFragmentManager, I18n.t("Remind me"), labels) { index ->
                if (index < PRESETS.size) add(message, PRESETS[index].second()) else open(ctx.sheet.requireContext())
            }
        }

        commands.registerCommand("reminders", "Open your message reminders") { ctx ->
            Common.ui { open(ctx.context) }
            CommandResult(null, null, false)
        }
    }

    override fun stop(context: Context) {
        scheduler?.stop()
        scheduler = null
        store.unload()
        super.stop(context)
    }

    private fun add(message: Message, at: Long) {
        store.add(Reminder(
            id = "${message.id}-$at",
            messageId = message.id,
            channelId = message.channelId,
            author = Common.displayName(message.author),
            content = Common.preview(message),
            remindAt = at,
        ))
        scheduler?.reschedule()
        Utils.showToast(I18n.t("Reminder set for {time}.", "time" to Common.formatTime(at)))
    }

    fun cancel(id: String) {
        store.removeIf { it.id == id }
        scheduler?.reschedule()
    }

    private fun open(context: Context) {
        store.load()
        Utils.openPageWithProxy(context, RemindersPage())
    }

    private companion object {
        const val LIMIT = 200
        const val MINUTE = 60_000L

        /** Today at [hour]:00 plus [days], in the device's time zone. */
        fun atHour(hour: Int, days: Int = 0): Long = Calendar.getInstance().run {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            add(Calendar.DAY_OF_YEAR, days)
            timeInMillis
        }

        // Same presets as Endcord PC
        val PRESETS: List<Pair<String, () -> Long>> = listOf(
            "In 30 minutes" to { System.currentTimeMillis() + 30 * MINUTE },
            "In 1 hour" to { System.currentTimeMillis() + 60 * MINUTE },
            "In 3 hours" to { System.currentTimeMillis() + 180 * MINUTE },
            "This evening" to { if (atHour(18) > System.currentTimeMillis()) atHour(18) else atHour(18, 1) },
            "Tomorrow morning" to { atHour(9, 1) },
        )
    }
}

internal class RemindersPage : BrowserPage() {
    private val plugin get() = PluginManager.plugins["MessageReminders"] as? MessageReminders

    override val pageTitle: String get() = I18n.t("Reminders")
    override val emptyText: String get() = I18n.t("No reminders yet. Long-press a message and tap Remind me.")

    override fun rows(): List<Row> {
        val plugin = plugin ?: return emptyList()
        return plugin.store.all().sortedBy { it.remindAt }.map { r ->
            Row(
                title = Common.formatTime(r.remindAt),
                body = "${r.author}: ${r.content.ifEmpty { I18n.t("(no text)") }}",
                haystack = haystack(r.author, r.content),
                actions = listOf(
                    I18n.t("Jump") to { Common.openMessage(requireContext(), r.channelId, r.messageId) },
                    I18n.t("Cancel") to {
                        plugin.cancel(r.id)
                        render()
                    },
                ),
            )
        }
    }
}
