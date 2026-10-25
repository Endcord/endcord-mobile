/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.customtimestamps

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.TextView
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.messagesbcommon.MomentFormat

internal class CustomTimestamps : EndcordPlugin(
    name = "CustomTimestamps",
    description = "Custom timestamps on messages and tooltips",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "customisation")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            key = "cozyFormat",
            label = "Cozy mode",
            description = "Time format to use in messages on cozy mode",
            default = "[calendar]",
            placeholder = "[calendar]",
        ),
        PluginSetting.Text(
            key = "sameDayFormat",
            label = "Same day",
            description = "[calendar] format for today",
            placeholder = "[Today at] HH:mm:ss",
        ),
        PluginSetting.Text(
            key = "lastDayFormat",
            label = "Last day",
            description = "[calendar] format for yesterday",
            placeholder = "[Yesterday at] HH:mm:ss",
        ),
        PluginSetting.Text(
            key = "lastWeekFormat",
            label = "Last week",
            description = "[calendar] format for within the last week",
            placeholder = DEFAULT_DATE_FORMAT,
        ),
        PluginSetting.Text(
            key = "sameElseFormat",
            label = "Older date",
            description = "[calendar] format for older dates",
            placeholder = DEFAULT_DATE_FORMAT,
        ),
        PluginSetting.Action(
            key = "docs",
            label = "Moment.js formatting documentation",
            description = "[calendar] enables dynamic date formatting such as \"Today\" or \"Yesterday\". " +
                "[relative] gives you times such as \"4 hours ago\".",
        ) { context ->
            context.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse("https://momentjs.com/docs/#/displaying/format/"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        },
    )

    /** The format of a setting, or the default when it was left empty. */
    private fun formatOf(key: String, default: () -> String): String = string(key).trim().ifEmpty { default() }

    private val decorator = object : ChatDecorator(name) {
        override fun formatTimestamp(entry: MessageEntry, millis: Long, view: TextView): CharSequence? {
            val template = formatOf("cozyFormat") { "[calendar]" }
            val now = System.currentTimeMillis()
            var result = MomentFormat.format(millis, template)

            // Like Endcord PC, the [calendar] and [relative] placeholders are filled in after formatting
            val calendarAt = result.indexOf("calendar")
            if (calendarAt >= 0) {
                val formats = MomentFormat.CalendarFormats(
                    sameDay = formatOf("sameDayFormat") { "[${I18n.t("Today at")}] HH:mm:ss" },
                    lastDay = formatOf("lastDayFormat") { "[${I18n.t("Yesterday at")}] HH:mm:ss" },
                    lastWeek = formatOf("lastWeekFormat") { DEFAULT_DATE_FORMAT },
                    sameElse = formatOf("sameElseFormat") { DEFAULT_DATE_FORMAT },
                )
                result = result.replaceRange(calendarAt, calendarAt + "calendar".length, MomentFormat.calendar(millis, now, formats))
            }
            val relativeAt = result.indexOf("relative")
            if (relativeAt >= 0) {
                result = result.replaceRange(relativeAt, relativeAt + "relative".length, MomentFormat.relative(millis, now))
            }
            return result
        }
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        super.stop(context)
    }

    private companion object {
        const val DEFAULT_DATE_FORMAT = "ddd DD.MM.YYYY HH:mm:ss"
    }
}
