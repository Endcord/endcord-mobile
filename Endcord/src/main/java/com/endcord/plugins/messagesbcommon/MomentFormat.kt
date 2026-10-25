/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagesbcommon

import android.icu.text.RelativeDateTimeFormatter
import android.icu.util.ULocale
import com.aliucord.PluginManager
import com.aliucord.Utils
import java.text.DateFormatSymbols
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.floor

/**
 * Formats dates with the Moment.js format tokens Endcord PC's timestamp plugins use (`HH:mm:ss`, `LT`,
 * `dddd`, `[literal]`, ...), so formats can be copied between the desktop and mobile versions.
 * Only called from the main thread.
 */
internal object MomentFormat {
    /** The formats [calendar] picks from, like Moment's `calendar()`. */
    class CalendarFormats(
        @JvmField val sameDay: String,
        @JvmField val lastDay: String,
        @JvmField val lastWeek: String,
        @JvmField val sameElse: String,
    )

    private const val DAY = 86_400_000L

    // Longest first so that e.g. "LLLL" is not read as four "L"
    private val TOKENS = arrayOf(
        "LLLL", "llll", "YYYY", "MMMM", "dddd", "LTS", "LLL", "lll", "MMM", "ddd", "SSS",
        "LT", "LL", "ll", "YY", "MM", "Do", "DD", "dd", "HH", "hh", "kk", "mm", "ss", "SS", "ZZ",
        "L", "l", "M", "D", "d", "H", "h", "k", "m", "s", "S", "A", "a", "Z", "X", "x", "Q",
    )

    private val patternCache = HashMap<String, SimpleDateFormat>()
    private var symbolsLocale: Locale? = null
    private var symbols: DateFormatSymbols? = null

    private fun is24Hour(): Boolean = try {
        android.text.format.DateFormat.is24HourFormat(Utils.appContext)
    } catch (_: Throwable) {
        false
    }

    private fun symbols(locale: Locale): DateFormatSymbols {
        val cached = symbols
        if (cached != null && symbolsLocale == locale) return cached
        return DateFormatSymbols.getInstance(locale).also {
            symbols = it
            symbolsLocale = locale
        }
    }

    /** A localized pattern for a skeleton such as `yMMMd`, cached. */
    private fun localized(skeleton: String, locale: Locale, millis: Long): String {
        val key = "$skeleton|$locale"
        val format = patternCache[key] ?: SimpleDateFormat(
            android.text.format.DateFormat.getBestDateTimePattern(locale, skeleton),
            locale,
        ).also { patternCache[key] = it }
        return format.format(Date(millis))
    }

    private fun timeSkeleton(seconds: Boolean): String = when {
        is24Hour() -> if (seconds) "Hms" else "Hm"
        else -> if (seconds) "hms" else "hm"
    }

    private fun StringBuilder.pad(value: Int, width: Int): StringBuilder {
        val s = value.toString()
        for (i in s.length until width) append('0')
        return append(s)
    }

    private fun ordinal(day: Int, locale: Locale): String {
        if (locale.language != "en") return day.toString()
        val suffix = when {
            day % 100 in 11..13 -> "th"
            day % 10 == 1 -> "st"
            day % 10 == 2 -> "nd"
            day % 10 == 3 -> "rd"
            else -> "th"
        }
        return "$day$suffix"
    }

    /** Formats [millis] with the Moment.js format [pattern]. */
    @JvmStatic
    @JvmOverloads
    fun format(millis: Long, pattern: String, locale: Locale = Locale.getDefault()): String {
        val cal = Calendar.getInstance(locale)
        cal.timeInMillis = millis
        val out = StringBuilder(pattern.length + 16)
        var i = 0
        val n = pattern.length
        while (i < n) {
            val c = pattern[i]
            if (c == '[') {
                val close = pattern.indexOf(']', i + 1)
                if (close > i) {
                    out.append(pattern, i + 1, close)
                    i = close + 1
                    continue
                }
            }
            val token = TOKENS.firstOrNull { pattern.startsWith(it, i) }
            if (token == null) {
                out.append(c)
                i++
                continue
            }
            appendToken(out, token, cal, millis, locale)
            i += token.length
        }
        return out.toString()
    }

    private fun appendToken(out: StringBuilder, token: String, cal: Calendar, millis: Long, locale: Locale) {
        val year = cal.get(Calendar.YEAR)
        val month = cal.get(Calendar.MONTH)
        val day = cal.get(Calendar.DAY_OF_MONTH)
        val weekday = cal.get(Calendar.DAY_OF_WEEK) // 1 = Sunday
        val hour = cal.get(Calendar.HOUR_OF_DAY)
        when (token) {
            "YYYY" -> out.pad(year, 4)
            "YY" -> out.pad(year % 100, 2)
            "Q" -> out.append(month / 3 + 1)
            "M" -> out.append(month + 1)
            "MM" -> out.pad(month + 1, 2)
            "MMM" -> out.append(symbols(locale).shortMonths[month])
            "MMMM" -> out.append(symbols(locale).months[month])
            "D" -> out.append(day)
            "DD" -> out.pad(day, 2)
            "Do" -> out.append(ordinal(day, locale))
            "d" -> out.append(weekday - 1)
            "dd" -> out.append(symbols(locale).shortWeekdays[weekday].take(2))
            "ddd" -> out.append(symbols(locale).shortWeekdays[weekday])
            "dddd" -> out.append(symbols(locale).weekdays[weekday])
            "H" -> out.append(hour)
            "HH" -> out.pad(hour, 2)
            "h" -> out.append(if (hour % 12 == 0) 12 else hour % 12)
            "hh" -> out.pad(if (hour % 12 == 0) 12 else hour % 12, 2)
            "k" -> out.append(if (hour == 0) 24 else hour)
            "kk" -> out.pad(if (hour == 0) 24 else hour, 2)
            "m" -> out.append(cal.get(Calendar.MINUTE))
            "mm" -> out.pad(cal.get(Calendar.MINUTE), 2)
            "s" -> out.append(cal.get(Calendar.SECOND))
            "ss" -> out.pad(cal.get(Calendar.SECOND), 2)
            "S" -> out.append(cal.get(Calendar.MILLISECOND) / 100)
            "SS" -> out.pad(cal.get(Calendar.MILLISECOND) / 10, 2)
            "SSS" -> out.pad(cal.get(Calendar.MILLISECOND), 3)
            "A", "a" -> {
                val amPm = symbols(locale).amPmStrings[if (hour < 12) 0 else 1]
                out.append(if (token == "A") amPm.uppercase(locale) else amPm.lowercase(locale))
            }
            "Z", "ZZ" -> {
                val offset = (cal.get(Calendar.ZONE_OFFSET) + cal.get(Calendar.DST_OFFSET)) / 60_000
                out.append(if (offset < 0) '-' else '+').pad(abs(offset) / 60, 2)
                if (token == "Z") out.append(':')
                out.pad(abs(offset) % 60, 2)
            }
            "X" -> out.append(millis / 1000)
            "x" -> out.append(millis)
            "LT" -> out.append(localized(timeSkeleton(false), locale, millis))
            "LTS" -> out.append(localized(timeSkeleton(true), locale, millis))
            "L" -> out.append(localized("yyyyMMdd", locale, millis))
            "l" -> out.append(localized("yyyyMd", locale, millis))
            "LL" -> out.append(localized("yyyyMMMMd", locale, millis))
            "ll" -> out.append(localized("yyyyMMMd", locale, millis))
            "LLL" -> out.append(localized("yyyyMMMMd", locale, millis)).append(' ')
                .append(localized(timeSkeleton(false), locale, millis))
            "lll" -> out.append(localized("yyyyMMMd", locale, millis)).append(' ')
                .append(localized(timeSkeleton(false), locale, millis))
            "LLLL" -> out.append(localized("yyyyMMMMdEEEE", locale, millis)).append(' ')
                .append(localized(timeSkeleton(false), locale, millis))
            "llll" -> out.append(localized("yyyyMMMdEEE", locale, millis)).append(' ')
                .append(localized(timeSkeleton(false), locale, millis))
            else -> out.append(token)
        }
    }

    /** Moment's `calendar()`: formats [millis] with one of [formats] depending on how many days ago it was. */
    @JvmStatic
    fun calendar(millis: Long, now: Long, formats: CalendarFormats): String {
        val startOfToday = Calendar.getInstance().apply {
            timeInMillis = now
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        val diff = (millis - startOfToday).toDouble() / DAY
        val pattern = when {
            diff < -6 -> formats.sameElse
            diff < -1 -> formats.lastWeek
            diff < 0 -> formats.lastDay
            diff < 1 -> formats.sameDay
            else -> formats.sameElse
        }
        return format(millis, pattern)
    }

    /**
     * Moment's `fromNow()` with the thresholds Endcord PC's CustomTimestamps uses, worded by Android's ICU
     * ("5 minutes ago"). Rounds down instead of to the nearest unit when DontRoundMyTimestamps is on.
     */
    @JvmStatic
    fun relative(millis: Long, now: Long, locale: Locale = Locale.getDefault()): String {
        val delta = now - millis
        val ms = abs(delta).toDouble()
        val roundDown = PluginManager.isPluginEnabled("DontRoundMyTimestamps")
        fun r(x: Double) = if (roundDown) floor(x) else floor(x + 0.5)

        val seconds = r(ms / 1000)
        val minutes = r(ms / 60_000)
        val hours = r(ms / 3_600_000)
        val days = r(ms / DAY)
        val monthsExact = ms / DAY * 4800 / 146097
        val months = r(monthsExact)
        val years = r(monthsExact / 12)

        val (quantity, unit) = when {
            seconds < 60 -> seconds to RelativeDateTimeFormatter.RelativeUnit.SECONDS
            minutes <= 1 -> 1.0 to RelativeDateTimeFormatter.RelativeUnit.MINUTES
            minutes < 60 -> minutes to RelativeDateTimeFormatter.RelativeUnit.MINUTES
            hours <= 1 -> 1.0 to RelativeDateTimeFormatter.RelativeUnit.HOURS
            hours < 22 -> hours to RelativeDateTimeFormatter.RelativeUnit.HOURS
            days <= 1 -> 1.0 to RelativeDateTimeFormatter.RelativeUnit.DAYS
            days < 26 -> days to RelativeDateTimeFormatter.RelativeUnit.DAYS
            months <= 1 -> 1.0 to RelativeDateTimeFormatter.RelativeUnit.MONTHS
            months < 11 -> months to RelativeDateTimeFormatter.RelativeUnit.MONTHS
            years <= 1 -> 1.0 to RelativeDateTimeFormatter.RelativeUnit.YEARS
            else -> years to RelativeDateTimeFormatter.RelativeUnit.YEARS
        }
        val direction = if (delta >= 0) RelativeDateTimeFormatter.Direction.LAST else RelativeDateTimeFormatter.Direction.NEXT
        return relativeFormatter(locale).format(quantity, direction, unit)
    }

    private var relativeLocale: Locale? = null
    private var relativeFormatter: RelativeDateTimeFormatter? = null

    private fun relativeFormatter(locale: Locale): RelativeDateTimeFormatter {
        val cached = relativeFormatter
        if (cached != null && relativeLocale == locale) return cached
        return RelativeDateTimeFormatter.getInstance(ULocale.forLocale(locale)).also {
            relativeFormatter = it
            relativeLocale = locale
        }
    }
}
