/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.sendtimestamps

import android.app.AlertDialog
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Context
import android.text.format.DateFormat
import android.text.format.DateUtils
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.endcord.plugins.composercommon.ChatInput
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.composercommon.OutgoingMessages
import java.util.Calendar
import java.util.Date
import java.util.regex.Pattern
import java.text.DateFormat as JavaDateFormat

internal class SendTimestamps : ComposerPlugin(
    name = "SendTimestamps",
    description = "Send timestamps easily via the send button's long-press menu & text shortcuts. See the settings!",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "commands")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            key = "replaceMessageContents",
            label = "Replace timestamps in message contents",
            description = "To quickly send time only timestamps, include timestamps formatted as `HH:MM` (including the backticks!) in your message",
            default = true,
        ),
    )

    override fun start(context: Context) {
        onOutgoing(OutgoingMessages.Priority.EXPAND) { message ->
            if (bool("replaceMessageContents")) message.content = replaceTimes(message.content)
        }
        composerAction("Insert Timestamp") { openPicker(it) }
    }

    private fun replaceTimes(content: String): String {
        if (!content.contains('`')) return content
        val matcher = TIME.matcher(content)
        if (!matcher.find()) return content
        val out = StringBuilder(content.length)
        var last = 0
        do {
            out.append(content, last, matcher.start())
            out.append(parseTime(matcher) ?: matcher.group())
            last = matcher.end()
        } while (matcher.find())
        out.append(content, last, content.length)
        return out.toString()
    }

    /** `HH:MM`, `H:MM AM` ... as the next time it happens, or null when it isn't a valid time. */
    private fun parseTime(match: java.util.regex.Matcher): String? {
        var hours = match.group(1)!!.toInt()
        val minutes = match.group(2)!!.toInt()
        val period = match.group(3)?.uppercase()
        if (minutes > 59) return null
        if (period != null) {
            if (hours > 12) return null
            hours = hours % 12 + if (period == "PM") 12 else 0
        } else if (hours > 24) {
            return null
        }

        val time = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            add(Calendar.HOUR_OF_DAY, hours)
            add(Calendar.MINUTE, minutes)
        }
        var seconds = time.timeInMillis / 1000
        // A time that already passed today means tomorrow
        if (System.currentTimeMillis() / 1000 > seconds) seconds += 86400
        return "<t:$seconds:t>"
    }

    private fun openPicker(input: ChatInput) {
        val context = input.context
        val now = Calendar.getInstance()
        DatePickerDialog(context, { _, year, month, day ->
            TimePickerDialog(context, { _, hour, minute ->
                val picked = Calendar.getInstance().apply {
                    set(year, month, day, hour, minute, 0)
                    set(Calendar.MILLISECOND, 0)
                }
                pickFormat(context, input, picked.timeInMillis / 1000)
            }, now.get(Calendar.HOUR_OF_DAY), now.get(Calendar.MINUTE), DateFormat.is24HourFormat(context)).show()
        }, now.get(Calendar.YEAR), now.get(Calendar.MONTH), now.get(Calendar.DAY_OF_MONTH)).show()
    }

    private fun pickFormat(context: Context, input: ChatInput, seconds: Long) {
        val date = Date(seconds * 1000)
        val labels = FORMATS.map { format -> "${preview(context, date, format)}  (${timestamp(seconds, format)})" }
        AlertDialog.Builder(context)
            .setTitle(I18n.t("Timestamp Format"))
            .setItems(labels.toTypedArray()) { _, which -> input.insert(timestamp(seconds, FORMATS[which]) + " ") }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun timestamp(seconds: Long, format: String) = if (format.isEmpty()) "<t:$seconds>" else "<t:$seconds:$format>"

    /** Roughly how Discord renders each style, so the list is readable. */
    private fun preview(context: Context, date: Date, format: String): String {
        val shortTime = DateFormat.getTimeFormat(context)
        return when (format) {
            "t" -> shortTime.format(date)
            "T" -> JavaDateFormat.getTimeInstance(JavaDateFormat.MEDIUM).format(date)
            "d" -> DateFormat.getDateFormat(context).format(date)
            "D" -> JavaDateFormat.getDateInstance(JavaDateFormat.LONG).format(date)
            "F" -> JavaDateFormat.getDateInstance(JavaDateFormat.FULL).format(date) + " " + shortTime.format(date)
            "s" -> DateFormat.getDateFormat(context).format(date) + " " + shortTime.format(date)
            "S" -> DateFormat.getDateFormat(context).format(date) + " " +
                JavaDateFormat.getTimeInstance(JavaDateFormat.MEDIUM).format(date)
            "R" -> DateUtils.getRelativeTimeSpanString(date.time, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString()
            else -> JavaDateFormat.getDateInstance(JavaDateFormat.LONG).format(date) + " " + shortTime.format(date)
        }
    }

    private companion object {
        val TIME: Pattern = Pattern.compile("`(\\d{1,2}):(\\d{2}) ?(AM|PM)?`", Pattern.CASE_INSENSITIVE)
        val FORMATS = listOf("", "t", "T", "d", "D", "f", "F", "s", "S", "R")
    }
}
