/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.unitconverter

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.tr
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.commandscommon.Dialogs
import com.endcord.plugins.commandscommon.Patterns
import com.lytefast.flexinput.R
import java.util.Locale
import java.util.regex.Matcher
import java.util.regex.Pattern
import kotlin.math.floor

internal class UnitConverter : EndcordPlugin(
    name = "UnitConverter",
    description = "Converts metric units to Imperal units and vice versa",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            key = "myUnits",
            label = "Your units",
            description = "the units you use and want things converted to. defaults to imperial",
            options = listOf(
                PluginSetting.Choice.Option("imperial", "Imperial"),
                PluginSetting.Choice.Option("metric", "Metric"),
            ),
        ),
    )

    private class Conversion(val pattern: Pattern, val convert: (Matcher) -> String)

    private fun num(m: Matcher, group: Int) = m.group(group)!!.toDouble()
    private fun fixed(value: Double) = String.format(Locale.ROOT, "%.2f", value)

    /**
     * Imperial units found in a message, converted to metric. Applied in order; combined units such as
     * "5 ft 11 in" go first so the single unit patterns don't need look-behinds.
     */
    private val fromImperial by lazy {
        listOf(
            // Fahrenheit
            Conversion(Pattern.compile("(-?\\d+(?:\\.\\d+)?)°?(f)(?!\\w)", Pattern.CASE_INSENSITIVE)) { "${fixed((num(it, 1) - 32) * 5 / 9)}°C" },
            // 5'11" and 5' 11
            Conversion(Pattern.compile("(\\d+)(') ?(\\d+(?:\\.\\d+)?)(\"|'')?")) { "${fixed(num(it, 1) / 3.281 + num(it, 3) / 39.37)}m" },
            // 5 ft 11 in
            Conversion(Pattern.compile("(\\d+) *(f(?:ee|oo)?t) *(\\d+(?:\\.\\d+)?) *(in(?:ches?)?)(?!\\w)", Pattern.CASE_INSENSITIVE)) {
                "${fixed(num(it, 1) / 3.281 + num(it, 3) / 39.37)}m"
            },
            Conversion(Pattern.compile("(\\d+(?:\\.\\d+)?) *(f(?:ee|oo)?t)(?!\\w)", Pattern.CASE_INSENSITIVE)) { "${fixed(num(it, 1) / 3.281)}m" },
            Conversion(Pattern.compile("(\\d+(?:\\.\\d+)?) *(in(?:ches?)?)(?!\\w)", Pattern.CASE_INSENSITIVE)) { "${fixed(num(it, 1) * 2.54)}cm" },
            // 5 lbs 3 oz
            Conversion(Pattern.compile("(\\d+(?:\\.\\d+)?) *(lbs?|pounds?) *(\\d+(?:\\.\\d+)?) *(ozs?|ounces?)(?!\\w)", Pattern.CASE_INSENSITIVE)) {
                "${fixed(num(it, 1) / 2.205 + num(it, 3) / 35.274)}kg"
            },
            Conversion(Pattern.compile("(\\d+(?:\\.\\d+)?) *(lbs?|pounds?)(?!\\w)", Pattern.CASE_INSENSITIVE)) { "${fixed(num(it, 1) / 2.205)}kg" },
            Conversion(Pattern.compile("(\\d+(?:\\.\\d+)?) ?(ounces?|oz)(?!\\w)", Pattern.CASE_INSENSITIVE)) { "${fixed(num(it, 1) * 28.35)}g" },
            Conversion(Pattern.compile("(\\d+(?:\\.\\d+)?) ?(m(?:p|/)h)(?!\\w)", Pattern.CASE_INSENSITIVE)) { "${fixed(num(it, 1) * 1.609)}km/h" },
        )
    }

    /** Metric units found in a message, converted to imperial. */
    private val fromMetric by lazy {
        listOf(
            // Celsius
            Conversion(Pattern.compile("(-?\\d+(?:\\.\\d+)?)\\s?°?c(?!\\w)", Pattern.CASE_INSENSITIVE)) { "${fixed(num(it, 1) * 9 / 5 + 32)}°F" },
            Conversion(Pattern.compile("(\\d+(?:\\.\\d+)?) ?(cm|centimeters?)(?!\\w)", Pattern.CASE_INSENSITIVE)) { "${fixed(num(it, 1) / 2.54)}in" },
            Conversion(Pattern.compile("(\\d+(?:\\.\\d+)?) ?(m|meters?)(?!\\w)", Pattern.CASE_INSENSITIVE)) {
                val feet = num(it, 1) * 3.28084
                val whole = floor(feet)
                val inches = (feet - whole) * 12
                if (inches < 0.005) "${whole.toLong()}ft" else "${whole.toLong()}ft${fixed(inches)}in"
            },
            // Before kilometers, which would otherwise eat the "km" of "km/h"
            Conversion(Pattern.compile("(\\d+(?:\\.\\d+)?) ?(km/h|kmph|kph|kilometers?/?h)(?!\\w)", Pattern.CASE_INSENSITIVE)) { "${fixed(num(it, 1) / 1.609)}mph" },
            Conversion(Pattern.compile("(\\d+(?:\\.\\d+)?) ?(km|kilometers?|kms?)(?!\\w)", Pattern.CASE_INSENSITIVE)) { "${fixed(num(it, 1) / 1.609)}mi" },
            Conversion(Pattern.compile("(\\d+(?:\\.\\d+)?) ?(grams?|g)(?!\\w)", Pattern.CASE_INSENSITIVE)) { "${fixed(num(it, 1) / 28.35)}oz(s)" },
            Conversion(Pattern.compile("(\\d+(?:\\.\\d+)?) ?(kg|kilo(?:gram)?s?)(?!\\w)", Pattern.CASE_INSENSITIVE)) { "${fixed(num(it, 1) * 2.205)}lb(s)" },
        )
    }

    override fun start(context: Context) {
        MessageActions.register(
            name,
            "Convert Units",
            R.e.ic_swap_vertical_circle_white_a60_24dp,
            visible = { actx -> actx.message.content.let { !it.isNullOrEmpty() && convert(it) != it } },
        ) { actx ->
            val activity = actx.sheet.activity ?: return@register
            Dialogs.showText(activity, tr("Convert Units"), convert(actx.message.content ?: ""))
        }
    }

    /** Converts every unit in [message] into the units chosen in settings. */
    private fun convert(message: String): String {
        val conversions = if (choice("myUnits") == "metric") fromImperial else fromMetric
        var result = message
        for (c in conversions) {
            result = Patterns.replace(c.pattern, result) { match ->
                try {
                    c.convert(match)
                } catch (_: NumberFormatException) {
                    // \d also matches non-ASCII digits on Android, which toDouble() rejects
                    match.group()
                }
            }
        }
        return result
    }
}
