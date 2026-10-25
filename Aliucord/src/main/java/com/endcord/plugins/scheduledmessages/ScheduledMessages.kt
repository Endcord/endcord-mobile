/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.scheduledmessages

import android.app.AlertDialog
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Context
import android.text.InputType
import android.text.format.DateFormat
import android.widget.EditText
import com.aliucord.Http
import com.aliucord.Utils
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.utils.DimenUtils
import com.aliucord.wrappers.ChannelWrapper.Companion.name
import com.aliucord.wrappers.ChannelWrapper.Companion.recipients
import com.discord.models.user.CoreUser
import com.discord.stores.StoreStream
import com.endcord.plugins.composercommon.ChatInputs
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.composercommon.ComposerUtils
import com.endcord.plugins.composercommon.OutgoingMessages
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.Date

/**
 * Text messages can be scheduled from the send button's long-press menu. They are sent while Endcord is
 * running, like on Endcord PC: anything that came due while the app was closed is sent on the next start.
 */
internal class ScheduledMessages : ComposerPlugin(
    name = "ScheduledMessages",
    description = "Schedule messages to be sent at a specific time or after a delay.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Number(
            "maxMessagesPerMinute",
            "Max scheduled messages per channel that can fire in the same minute.",
            default = 3,
            min = 1,
            max = 5,
        ),
        PluginSetting.Number("checkIntervalSeconds", "How often to check for messages to send (seconds).", default = 10, min = 5, max = 60),
        PluginSetting.Switch("showNotifications", "Show toast notifications when messages are sent.", default = true),
        PluginSetting.Action("view", "View Scheduled Messages") { openList(it) },
    )

    private class Scheduled(val id: String, val channelId: Long, val content: String, val time: Long, val createdAt: Long)

    private val queue = ArrayList<Scheduled>()
    private var scheduleMode = false
    private var running = false
    private var sending = false

    private val checker = object : Runnable {
        override fun run() {
            if (!running) return
            sendDue()
            Utils.mainThread.postDelayed(this, int("checkIntervalSeconds").coerceIn(5, 60) * 1000L)
        }
    }

    override fun start(context: Context) {
        load()
        running = true
        // Give the app a moment to connect before sending what came due while it was closed
        Utils.mainThread.postDelayed(checker, START_DELAY_MS)

        composerAction("Schedule Mode", checked = { scheduleMode }) {
            scheduleMode = !scheduleMode
            Utils.showToast(I18n.t(if (scheduleMode) "Schedule Mode ON" else "Schedule Mode OFF"))
        }
        composerAction("View Scheduled Messages", visible = { queue.isNotEmpty() }) { openList(it.context) }

        onOutgoing(OutgoingMessages.Priority.DELIVERY) { message ->
            if (!scheduleMode || message.startsThread || message.content.isBlank()) return@onOutgoing
            if (message.attachments.isNotEmpty()) {
                Utils.showToast(I18n.t("Scheduled messages can't include files"))
                message.cancel(clearInput = false)
                return@onOutgoing
            }
            if (message.content.length > ComposerUtils.messageLimit()) {
                Utils.showToast(I18n.t("This message is too long to schedule"))
                message.cancel(clearInput = false)
                return@onOutgoing
            }
            scheduleMode = false
            val channelId = message.channelId
            val content = message.content
            message.cancel(clearInput = true)
            Utils.mainThread.post { askTime(message.context, channelId, content) }
        }
    }

    override fun stop(context: Context) {
        running = false
        scheduleMode = false
        Utils.mainThread.removeCallbacks(checker)
        super.stop(context)
    }

    // ---- choosing the time ----

    private fun askTime(context: Context, channelId: Long, content: String) {
        val options = arrayOf(I18n.t("Delay (minutes)"), I18n.t("Date & Time"))
        AlertDialog.Builder(context)
            .setTitle(I18n.t("Schedule Message"))
            .setItems(options) { _, which ->
                if (which == 0) askDelay(context, channelId, content) else askDate(context, channelId, content)
            }
            .setNegativeButton(android.R.string.cancel) { _, _ -> restore(content) }
            .setOnCancelListener { restore(content) }
            .show()
    }

    private fun askDelay(context: Context, channelId: Long, content: String) {
        val input = EditText(context).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            hint = I18n.t("Delay (minutes)")
            val padding = DimenUtils.defaultPadding
            setPadding(padding, padding, padding, padding)
        }
        AlertDialog.Builder(context)
            .setTitle(I18n.t("Delay (minutes)"))
            .setView(input)
            .setPositiveButton(android.R.string.ok) { _, _ ->
                val minutes = input.text.toString().toIntOrNull()
                if (minutes == null || minutes < 1) {
                    Utils.showToast(I18n.t("Please enter a valid delay"))
                    restore(content)
                } else {
                    add(channelId, content, System.currentTimeMillis() + minutes * 60_000L)
                }
            }
            .setNegativeButton(android.R.string.cancel) { _, _ -> restore(content) }
            .setOnCancelListener { restore(content) }
            .show()
    }

    private fun askDate(context: Context, channelId: Long, content: String) {
        val now = Calendar.getInstance()
        val picker = DatePickerDialog(context, { _, year, month, day ->
            TimePickerDialog(context, { _, hour, minute ->
                val time = Calendar.getInstance().apply {
                    set(year, month, day, hour, minute, 0)
                    set(Calendar.MILLISECOND, 0)
                }.timeInMillis
                if (time <= System.currentTimeMillis()) {
                    Utils.showToast(I18n.t("Please select a future date and time"))
                    restore(content)
                } else {
                    add(channelId, content, time)
                }
            }, now.get(Calendar.HOUR_OF_DAY), now.get(Calendar.MINUTE), DateFormat.is24HourFormat(context)).apply {
                // Cancel and back both cancel the dialog
                setOnCancelListener { restore(content) }
            }.show()
        }, now.get(Calendar.YEAR), now.get(Calendar.MONTH), now.get(Calendar.DAY_OF_MONTH))
        picker.datePicker.minDate = now.timeInMillis - 1000
        picker.setOnCancelListener { restore(content) }
        picker.show()
    }

    /** Puts the text back into the chat input when scheduling was cancelled. */
    private fun restore(content: String) {
        val input = ChatInputs.current().firstOrNull()?.l() ?: return
        if (input.text.isNullOrEmpty()) {
            input.setText(content)
            input.setSelection(content.length)
        }
    }

    private fun add(channelId: Long, content: String, time: Long) {
        val minuteStart = time / 60_000 * 60_000
        val max = int("maxMessagesPerMinute").coerceIn(1, 5)
        val sameMinute = queue.count { it.channelId == channelId && it.time >= minuteStart && it.time < minuteStart + 60_000 }
        if (sameMinute >= max) {
            Utils.showToast(I18n.t("Maximum of {count} messages per channel per minute reached", "count" to max))
            restore(content)
            return
        }
        val now = System.currentTimeMillis()
        queue += Scheduled("$now-${(Math.random() * 1e9).toLong().toString(36)}", channelId, content, time, now)
        queue.sortBy { it.time }
        save()
        Utils.showToast(I18n.t("Message scheduled!"))
    }

    // ---- sending ----

    private fun sendDue() {
        if (sending) return
        val now = System.currentTimeMillis()
        val due = queue.filter { it.time <= now }
        if (due.isEmpty()) return
        queue.removeAll(due)
        save()
        sending = true
        Utils.threadPool.execute {
            for (message in due) {
                val ok = post(message)
                Utils.mainThread.post {
                    if (bool("showNotifications")) {
                        Utils.showToast(
                            if (ok) I18n.t("Scheduled message sent to {channel}", "channel" to channelName(message.channelId))
                            else I18n.t("Failed to send scheduled message"),
                        )
                    }
                }
            }
            Utils.mainThread.post { sending = false }
        }
    }

    private fun post(message: Scheduled): Boolean = try {
        val body = mapOf("content" to message.content, "nonce" to Utils.generateRNNonce().toString())
        Http.Request.newDiscordRNRequest("/channels/${message.channelId}/messages", "POST").executeWithJson(body).use { it.ok() }
    } catch (e: Throwable) {
        logger.error("Failed to send a scheduled message", e)
        false
    }

    private fun channelName(channelId: Long): String {
        val channel = StoreStream.getChannels().getChannel(channelId) ?: return I18n.t("Unknown")
        val name = channel.name
        if (name.isNotEmpty()) return name
        return try {
            channel.recipients?.firstOrNull()?.let { CoreUser(it).username } ?: "DM"
        } catch (e: Throwable) {
            "DM"
        }
    }

    // ---- list ----

    private fun openList(context: Context) {
        if (queue.isEmpty()) {
            Utils.showToast(I18n.t("No scheduled messages"))
            return
        }
        val dateFormat = DateFormat.getMediumDateFormat(context)
        val timeFormat = DateFormat.getTimeFormat(context)
        val entries = queue.toList()
        val labels = entries.map {
            val date = Date(it.time)
            "${dateFormat.format(date)} ${timeFormat.format(date)} · ${channelName(it.channelId)}\n${it.content.take(80)}"
        }
        AlertDialog.Builder(context)
            .setTitle(I18n.t("Scheduled Messages"))
            .setItems(labels.toTypedArray()) { _, which -> openEntry(context, entries[which]) }
            .setNeutralButton(I18n.t("Clear All")) { _, _ ->
                queue.clear()
                save()
                Utils.showToast(I18n.t("All scheduled messages cleared"))
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun openEntry(context: Context, entry: Scheduled) {
        AlertDialog.Builder(context)
            .setMessage(entry.content)
            .setPositiveButton(I18n.t("Send Now")) { _, _ ->
                queue.removeAll { it.id == entry.id }
                save()
                Utils.threadPool.execute {
                    val ok = post(entry)
                    if (!ok) Utils.mainThread.post { Utils.showToast(I18n.t("Failed to send scheduled message")) }
                }
            }
            .setNeutralButton(I18n.t("Remove")) { _, _ ->
                queue.removeAll { it.id == entry.id }
                save()
                Utils.showToast(I18n.t("Scheduled message removed"))
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    // ---- storage ----

    private fun load() {
        queue.clear()
        try {
            val array = JSONArray(settings.getString(QUEUE_KEY, "[]") ?: "[]")
            for (i in 0 until array.length()) {
                val obj = array.optJSONObject(i) ?: continue
                queue += Scheduled(
                    obj.optString("id"),
                    obj.optString("channelId").toLongOrNull() ?: continue,
                    obj.optString("content"),
                    obj.optLong("scheduledTime"),
                    obj.optLong("createdAt"),
                )
            }
            queue.sortBy { it.time }
        } catch (e: Throwable) {
            logger.error("Failed to load scheduled messages", e)
        }
    }

    private fun save() {
        val array = JSONArray()
        for (message in queue) {
            array.put(
                JSONObject()
                    .put("id", message.id)
                    .put("channelId", message.channelId.toString())
                    .put("content", message.content)
                    .put("scheduledTime", message.time)
                    .put("createdAt", message.createdAt),
            )
        }
        settings.setString(QUEUE_KEY, array.toString())
    }

    private companion object {
        const val QUEUE_KEY = "queue"
        const val START_DELAY_MS = 15_000L
    }
}
