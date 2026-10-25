/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.guildscommon

import java.text.DateFormat
import java.util.Date

/** Small formatting helpers shared by this batch's pages. */
internal object Formats {
    private const val DISCORD_EPOCH = 1420070400000L

    /** When the object with the snowflake [id] was created, in milliseconds. */
    @JvmStatic
    fun snowflakeTime(id: Long): Long = (id ushr 22) + DISCORD_EPOCH

    /** A date and time in the user's locale. */
    @JvmStatic
    fun dateTime(millis: Long): String =
        DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(millis))

    /** A date in the user's locale. */
    @JvmStatic
    fun date(millis: Long): String = DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(millis))

    /** A compact duration such as `30s`, `5m`, `2h` or `1h 30m`. */
    @JvmStatic
    fun duration(seconds: Long): String {
        val h = seconds / 3600
        val m = seconds % 3600 / 60
        val s = seconds % 60
        val parts = ArrayList<String>(3)
        if (h > 0) parts += "${h}h"
        if (m > 0) parts += "${m}m"
        if (s > 0 || parts.isEmpty()) parts += "${s}s"
        return parts.joinToString(" ")
    }

    /** How long ago [millis] was, as on Endcord PC: `5m`, `3h`, `2d`, `4mo`, `1y`. */
    @JvmStatic
    fun relative(millis: Long, now: Long = System.currentTimeMillis()): String {
        val diff = (now - millis).coerceAtLeast(0)
        val minutes = diff / 60000
        val hours = diff / 3600000
        val days = diff / 86400000
        return when {
            days >= 365 -> "${days / 365}y"
            days >= 30 -> "${days / 30}mo"
            days > 0 -> "${days}d"
            hours > 0 -> "${hours}h"
            else -> "${minutes.coerceAtLeast(1)}m"
        }
    }
}
