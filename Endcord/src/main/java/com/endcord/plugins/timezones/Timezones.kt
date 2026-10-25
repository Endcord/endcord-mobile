/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.timezones

import android.content.Context
import android.text.format.DateFormat
import android.widget.TextView
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.recipientIds
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.commandscommon.Dialogs
import com.endcord.plugins.commandscommon.Net
import com.endcord.plugins.identitycommon.ChatRefresh
import com.endcord.plugins.identitycommon.Members
import com.lytefast.flexinput.R
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

internal class Timezones : EndcordPlugin(
    name = "Timezones",
    description = "Shows the local time of users in message headers",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "chat", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch("showOwnTimezone", "Show your own timezone in message headers", default = true),
        PluginSetting.Switch("twentyFourHourFormat", "24h Time", "Show time in 24h format"),
        PluginSetting.Switch("showTimezoneInfo", "Show timezone info next to time", default = true),
        PluginSetting.Switch("showMessageHeaderTime", "Show time in message headers", default = true),
        PluginSetting.Switch("recipientTimezoneInDms", "In DMs, show the recipient's timezone on your messages"),
        PluginSetting.Switch("showLocalTimezone", "Show Local Timezone instead of just local"),
        PluginSetting.Switch("useDatabase", "Enable database for getting user timezones", default = true),
        PluginSetting.Switch("preferDatabaseOverLocal", "Prefer database over local storage for timezones", default = true),
        PluginSetting.Text("databaseUrl", "Database URL for timezone storage", default = DEFAULT_DATABASE),
        PluginSetting.Action("refreshDatabase", "Refresh Database Timezones") { loadDatabase(true) },
    )

    // Timezones set on this device, user id -> timezone id. Kept in memory, saved on every change
    private val local = HashMap<Long, String>()

    // Timezones from the shared database, replaced as a whole when a new list arrives
    @Volatile
    private var database: Map<Long, String> = emptyMap()

    // SimpleDateFormat isn't thread safe; these are only used on the main thread while binding
    private val formats = HashMap<String, SimpleDateFormat>()
    private val zones = HashMap<String, TimeZone>()

    private fun loadLocal() {
        local.clear()
        try {
            val json = JSONObject(settings.getString(LOCAL_KEY, "{}") ?: "{}")
            val keys = json.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val id = key.toLongOrNull() ?: continue
                json.optString(key).takeIf { it.isNotEmpty() }?.let { local[id] = it }
            }
        } catch (e: Throwable) {
            logger.error("Failed to read saved timezones", e)
        }
    }

    private fun saveLocal() {
        val json = JSONObject()
        for ((id, tz) in local) json.put(id.toString(), tz)
        settings.setString(LOCAL_KEY, json.toString())
        ChatRefresh.refresh()
    }

    /** Loads the shared database in the background. Failures only show a toast when [manual]. */
    private fun loadDatabase(manual: Boolean) {
        if (!bool("useDatabase")) {
            if (manual) Utils.showToast(I18n.t("Timezones Failed to refresh!"))
            return
        }
        val base = string("databaseUrl").trim().trimEnd('/').ifEmpty { DEFAULT_DATABASE }
        Utils.threadPool.execute {
            val result = HashMap<Long, String>()
            try {
                val json = Net.getObject("$base/list")
                val keys = json.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    val id = key.toLongOrNull() ?: continue
                    val tz = json.optJSONObject(key)?.optString("timezone").orEmpty()
                    if (tz.isNotEmpty() && tz != "null") result[id] = tz
                }
                database = result
                ChatRefresh.refresh()
                if (manual) Utils.showToast(I18n.t("Timezones refreshed successfully!"))
            } catch (e: Throwable) {
                logger.warn("Failed to load the timezone database: ${e.message}", null)
                if (manual) Utils.showToast(I18n.t("Timezones Failed to refresh!"))
            }
        }
    }

    /** Port of Endcord PC's resolveUserTimezone. */
    private fun resolve(userId: Long): String? {
        val localTz = local[userId]
        val useDatabase = bool("useDatabase") && (bool("preferDatabaseOverLocal") || localTz == null)
        return if (useDatabase) database[userId] ?: localTz else localTz
    }

    private fun zone(id: String): TimeZone? = zones.getOrPut(id) {
        val tz = TimeZone.getTimeZone(id)
        // getTimeZone falls back to GMT for unknown ids; treat those as unknown unless GMT was asked for
        if (tz.id != id && !id.equals("GMT", ignoreCase = true)) return null
        tz
    }

    private fun format(tz: TimeZone, context: Context): SimpleDateFormat {
        val pattern = if (bool("twentyFourHourFormat")) "HH:mm" else DateFormat.getBestDateTimePattern(Locale.getDefault(), "hmm")
        return formats.getOrPut("${tz.id}|$pattern") {
            SimpleDateFormat(pattern, Locale.getDefault()).apply { timeZone = tz }
        }
    }

    private fun displayTime(tzId: String, millis: Long, view: TextView): String? {
        val tz = zone(tzId) ?: return null
        val time = format(tz, view.context).format(Date(millis))
        if (!bool("showTimezoneInfo")) return time
        if (tz.id == TimeZone.getDefault().id && !bool("showLocalTimezone")) return I18n.t("local")
        val abbreviation = tz.getDisplayName(tz.inDaylightTime(Date(millis)), TimeZone.SHORT, Locale.getDefault())
        return "$time $abbreviation"
    }

    private val decorator = object : ChatDecorator(name, priority = 70) {
        override fun timestampSuffix(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, view: TextView): CharSequence? {
            ChatRefresh.track(holder)
            if (!bool("showMessageHeaderTime")) return null
            val message = entry.message
            var userId = message.author?.id ?: return null
            if (userId == Members.myId()) {
                val channel = Members.channel(message.channelId)
                val recipient = if (channel != null && Members.isDm(message.channelId)) channel.recipientIds.firstOrNull() else null
                if (bool("recipientTimezoneInDms") && recipient != null) userId = recipient
                else if (!bool("showOwnTimezone")) return null
            }
            val tz = resolve(userId) ?: return null
            val millis = message.timestamp?.g() ?: return null
            val text = displayTime(tz, millis, view) ?: return null
            return " ($text)"
        }
    }

    /** Lets you pick a timezone: first the region, then the place. */
    private fun pickTimezone(context: Context, onPicked: (String) -> Unit) {
        val ids = TimeZone.getAvailableIDs().filter { it.contains('/') && !it.startsWith("Etc/") && !it.startsWith("SystemV/") }
        val regions = ids.map { it.substringBefore('/') }.distinct().sorted()
        Dialogs.showList(context, I18n.t("Set Local Timezone"), regions) { regionIndex ->
            val region = regions[regionIndex]
            val places = ids.filter { it.startsWith("$region/") }.sorted()
            Dialogs.showList(context, region, places.map { it.substringAfter('/').replace('_', ' ') }) { placeIndex ->
                onPicked(places[placeIndex])
            }
        }
    }

    override fun start(context: Context) {
        loadLocal()
        ChatHooks.register(decorator)
        loadDatabase(false)

        MessageActions.register(name, "Set Local Timezone", R.e.ic_clock_24dp, visible = { it.message.author != null }) { ctx ->
            val userId = ctx.message.author?.id ?: return@register
            val activity = ctx.sheet.activity ?: return@register
            pickTimezone(activity) { tz ->
                local[userId] = tz
                saveLocal()
            }
        }
        MessageActions.register(
            name,
            "Delete Local Timezone",
            R.e.ic_clock_24dp,
            visible = { ctx -> ctx.message.author?.id?.let { local.containsKey(it) } == true },
        ) { ctx ->
            val userId = ctx.message.author?.id ?: return@register
            local.remove(userId)
            saveLocal()
        }
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        formats.clear()
        zones.clear()
        database = emptyMap()
        super.stop(context)
    }

    private companion object {
        const val LOCAL_KEY = "localTimezones"
        const val DEFAULT_DATABASE = "https://timezone.creations.works"
    }
}
