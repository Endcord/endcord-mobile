/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.replytimestamp

import android.content.Context
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.widget.TextView
import com.aliucord.entities.EndcordPlugin
import com.discord.utilities.time.TimeUtils
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.messagesbcommon.ChatDecorator
import com.endcord.plugins.messagesbcommon.ChatHooks
import com.endcord.plugins.messagesbcommon.mutedColor
import java.util.Calendar
import java.util.Date

internal class ReplyTimestamp : EndcordPlugin(
    name = "ReplyTimestamp",
    description = "Shows a timestamp on replied-message previews",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "appearance")

    private val calendarA: Calendar = Calendar.getInstance()
    private val calendarB: Calendar = Calendar.getInstance()

    private fun isSameDay(a: Long, b: Long): Boolean {
        calendarA.timeInMillis = a
        calendarB.timeInMillis = b
        return calendarA.get(Calendar.YEAR) == calendarB.get(Calendar.YEAR) &&
            calendarA.get(Calendar.DAY_OF_YEAR) == calendarB.get(Calendar.DAY_OF_YEAR)
    }

    private val decorator = object : ChatDecorator(name, priority = 50) {
        override fun replyNameSuffix(entry: MessageEntry, replied: MessageEntry, view: TextView): CharSequence? {
            val repliedAt = replied.message.timestamp?.g() ?: return null
            val sentAt = entry.message.timestamp?.g() ?: 0L
            val context = view.context

            // Like Endcord PC: only the time when both are from the same day, otherwise a calendar date
            val time: CharSequence = if (sentAt > 0 && isSameDay(repliedAt, sentAt)) {
                android.text.format.DateFormat.getTimeFormat(context).format(Date(repliedAt))
            } else {
                TimeUtils.`toReadableTimeString$default`(context, repliedAt, null, 4, null)
            }

            val text = SpannableString("  $time")
            text.setSpan(ForegroundColorSpan(mutedColor(context)), 0, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            text.setSpan(RelativeSizeSpan(0.85f), 0, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            return text
        }
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        super.stop(context)
    }
}
