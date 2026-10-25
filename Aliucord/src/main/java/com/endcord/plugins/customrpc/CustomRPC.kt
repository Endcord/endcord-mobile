/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.customrpc

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.entities.PluginSetting.Choice.Option
import com.discord.api.activity.Activity
import com.discord.api.activity.ActivityParty
import com.discord.api.activity.ActivityType
import com.endcord.plugins.presencecommon.Activities
import com.endcord.plugins.presencecommon.AppAssets
import com.endcord.plugins.presencecommon.PresenceHub
import java.util.Calendar
import java.util.regex.Pattern

internal class CustomRPC : EndcordPlugin(
    name = "CustomRPC",
    description = "Add a fully customisable Rich Presence (Game status) to your Discord profile",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("activity", "customisation")

    override val settingsSchema = listOf(
        PluginSetting.Text("appID", "Application ID", "Go to the Discord Developer Portal to create an application and get the application ID. Needed for images."),
        PluginSetting.Text("appName", "Application Name", "Required. The name shown after \"Playing\""),
        PluginSetting.Choice(
            "type", "Activity Type", null,
            listOf(
                Option("0", "Playing"),
                Option("1", "Streaming"),
                Option("2", "Listening"),
                Option("3", "Watching"),
                Option("5", "Competing"),
            ),
        ),
        PluginSetting.Text("details", "Detail (line 1)"),
        PluginSetting.Text("state", "State (line 2)"),
        PluginSetting.Text("streamLink", "Stream Link (Twitch or YouTube, only if activity type is Streaming)"),
        PluginSetting.Choice(
            "timestampMode", "Timestamp Mode", null,
            listOf(
                Option("none", "None"),
                Option("now", "Since discord open"),
                Option("time", "Same as your current time (not reset after 24h)"),
                Option("custom", "Custom"),
            ),
        ),
        PluginSetting.Text("startTime", "Start Timestamp (in milliseconds)", "Only used with the Custom timestamp mode"),
        PluginSetting.Text("endTime", "End Timestamp (in milliseconds)", "Only used with the Custom timestamp mode"),
        PluginSetting.Text("imageBig", "Large Image URL/Key", "An image link, or the name of an image uploaded in the Rich Presence tab of your application"),
        PluginSetting.Text("imageBigTooltip", "Large Image Text"),
        PluginSetting.Text("imageSmall", "Small Image URL/Key"),
        PluginSetting.Text("imageSmallTooltip", "Small Image Text"),
        PluginSetting.Text("buttonOneText", "Button1 Text", "You can't see your own buttons on your profile, but everyone else can see it fine."),
        PluginSetting.Text("buttonOneURL", "Button1 URL"),
        PluginSetting.Text("buttonTwoText", "Button2 Text"),
        PluginSetting.Text("buttonTwoURL", "Button2 URL"),
        PluginSetting.Number("partySize", "Party Size", null, 0, 0, 1_000_000),
        PluginSetting.Number("partyMaxSize", "Maximum Party Size", null, 0, 0, 1_000_000),
    )

    @Volatile
    private var running = false
    private var generation = 0
    private var startedAt = 0L

    override fun start(context: Context) {
        running = true
        startedAt = System.currentTimeMillis()
        update()
    }

    override fun stop(context: Context) {
        synchronized(this) {
            running = false
            generation++
            PresenceHub.unregisterAll(name)
        }
        super.stop(context)
    }

    override fun onSettingChanged(key: String) {
        if (key == "appID") appId()?.let { AppAssets.invalidate(it) }
        update()
    }

    private fun appId(): Long? = string("appID").trim().takeIf { APP_ID.matcher(it).matches() }?.toLongOrNull()

    /** Rebuilds the activity in the background, since images may need a request to Discord. */
    private fun update() {
        val gen = synchronized(this) { ++generation }
        Utils.threadPool.execute {
            val activity = try {
                build()
            } catch (e: Throwable) {
                logger.error("Failed to build the rich presence", e)
                null
            }
            synchronized(this) {
                if (running && gen == generation) PresenceHub.setActivity(name, activity)
            }
        }
    }

    private fun build(): Activity? {
        val appName = string("appName").trim().take(128)
        if (appName.isEmpty()) return null
        val appId = appId()
        val type = when (choice("type")) {
            "1" -> ActivityType.STREAMING
            "2" -> ActivityType.LISTENING
            "3" -> ActivityType.WATCHING
            "5" -> ActivityType.COMPETING
            else -> ActivityType.PLAYING
        }

        var start: Long? = null
        var end: Long? = null
        when (choice("timestampMode")) {
            "now" -> start = startedAt
            "time" -> start = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, 0)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }.timeInMillis
            "custom" -> {
                start = string("startTime").trim().toLongOrNull()?.takeIf { it > 0 }
                end = string("endTime").trim().toLongOrNull()?.takeIf { it > 0 }
            }
        }

        val big = string("imageBig").trim()
        val small = string("imageSmall").trim()
        // Images need an application, except links Discord already proxies
        val bigImage = if (big.isEmpty() || appId == null) null else AppAssets.resolve(appId, big)
        val smallImage = if (small.isEmpty() || appId == null) null else AppAssets.resolve(appId, small)

        val buttons = ArrayList<String>()
        val urls = ArrayList<String>()
        for ((textKey, urlKey) in BUTTONS) {
            val text = string(textKey).trim().take(31)
            val url = string(urlKey).trim()
            if (text.isNotEmpty() && URL.matcher(url).matches()) {
                buttons.add(text)
                urls.add(url)
            }
        }

        val size = int("partySize")
        val max = int("partyMaxSize")
        val party = if (size > 0 && max > 0) ActivityParty(null, listOf(size.toLong(), max.toLong())) else null
        val streamLink = string("streamLink").trim()

        return Activities.create(
            name = appName,
            type = type,
            applicationId = appId,
            details = string("details").trim().take(128).ifEmpty { null },
            state = string("state").trim().take(128).ifEmpty { null },
            url = if (type == ActivityType.STREAMING && STREAM.matcher(streamLink).find()) streamLink else null,
            start = start,
            end = end,
            assets = Activities.assets(bigImage, string("imageBigTooltip").trim(), smallImage, string("imageSmallTooltip").trim()),
            party = party,
            buttons = buttons,
            buttonUrls = urls,
        )
    }

    private companion object {
        val APP_ID: Pattern = Pattern.compile("^\\d{16,21}$")
        val URL: Pattern = Pattern.compile("^https?://.+")
        val STREAM: Pattern = Pattern.compile("https?://(www\\.)?(twitch\\.tv|youtube\\.com)/\\w+")
        val BUTTONS = arrayOf(arrayOf("buttonOneText", "buttonOneURL"), arrayOf("buttonTwoText", "buttonTwoURL"))
    }
}
