/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.remindme

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import com.aliucord.Utils
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.tr
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.discord.stores.StoreStream
import com.discord.utilities.intent.IntentUtils
import com.endcord.plugins.commandscommon.BotMessages
import com.endcord.plugins.commandscommon.Options
import com.lytefast.flexinput.R
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.min

internal class RemindMe : EndcordPlugin(
    name = "RemindMe",
    description = "/remindme <amount> <m|h|d> <text> pings you with a notification later. Survives restarts.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("commands", "utility")

    private class Reminder(val id: Long, val text: String, val time: Long, val channelId: Long)

    private val units = mapOf("m" to 60_000L, "h" to 3_600_000L, "d" to 86_400_000L)

    private val lock = Any()
    private val reminders = ArrayList<Reminder>()

    private var appContext: Context? = null
    private var receiver: BroadcastReceiver? = null
    private val tick = Runnable { fireDue() }

    override val settingsSchema = listOf(
        PluginSetting.Action(
            key = "clearReminders",
            label = "Clear all reminders",
            description = "Cancels every reminder that hasn't fired yet",
        ) {
            val running = appContext != null
            val count = synchronized(lock) {
                // While the plugin is off its reminders are only on disk
                if (!running) reminders.addAll(load())
                reminders.size.also { reminders.clear() }
            }
            persist()
            if (running) reschedule()
            Utils.showToast(tr("Removed {count} reminders", "count" to count))
        },
    )

    override fun start(context: Context) {
        appContext = context
        synchronized(lock) {
            reminders.clear()
            reminders.addAll(load())
        }

        receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context, intent: Intent) = fireDue()
        }.also {
            val filter = IntentFilter(ACTION_FIRE)
            if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(it, filter, Context.RECEIVER_NOT_EXPORTED)
            else context.registerReceiver(it, filter)
        }

        commands.registerCommand(
            "remindme",
            "Set a reminder",
            listOf(
                Options.integer("amount", "How many units from now", required = true),
                Options.string(
                    "unit", "Unit of time", required = true,
                    choices = listOf(
                        Utils.createCommandChoice("minutes", "m"),
                        Utils.createCommandChoice("hours", "h"),
                        Utils.createCommandChoice("days", "d"),
                    ),
                ),
                Options.string("text", "What to remind you about", required = true),
            ),
        ) { ctx ->
            val amount = ctx.getRequiredLong("amount")
            val unit = units[ctx.getRequiredString("unit")] ?: units.getValue("m")
            val text = ctx.getRequiredString("text").trim()
            if (amount <= 0 || amount > 3650 * 86_400_000L / unit) {
                return@registerCommand CommandResult(tr("Give me a positive amount of time."), null, false)
            }
            val reminder = Reminder(System.nanoTime(), text, System.currentTimeMillis() + amount * unit, ctx.channelId)
            synchronized(lock) { reminders += reminder }
            persist()
            Utils.mainThread.post { reschedule() }
            CommandResult(
                tr("⏰ Okay! I'll remind you about **{text}** {time}.", "text" to text, "time" to "<t:${reminder.time / 1000}:R>"),
                null,
                false,
            )
        }

        // Reminders that came due while the app was closed fire now
        Utils.mainThread.post { fireDue() }
    }

    override fun stop(context: Context) {
        Utils.mainThread.removeCallbacks(tick)
        cancelAlarm(context)
        receiver?.let {
            try {
                context.unregisterReceiver(it)
            } catch (_: IllegalArgumentException) {
            }
        }
        receiver = null
        appContext = null
        super.stop(context)
    }

    /** Shows every reminder that is due, then waits for the next one. Main thread only. */
    private fun fireDue() {
        val context = appContext ?: return
        val now = System.currentTimeMillis()
        val due = synchronized(lock) {
            val due = reminders.filter { it.time <= now }
            reminders.removeAll(due)
            due
        }
        if (due.isNotEmpty()) {
            for (reminder in due) {
                try {
                    notify(context, reminder)
                } catch (e: Throwable) {
                    logger.error("Failed to show a reminder", e)
                }
            }
            persist()
        }
        reschedule()
    }

    /**
     * Arms an alarm for the next reminder so it fires on time even while the phone sleeps, plus a handler
     * fallback that re-checks at least every minute in case the alarm is delayed. Main thread only.
     */
    private fun reschedule() {
        val context = appContext ?: return
        Utils.mainThread.removeCallbacks(tick)
        val next = synchronized(lock) { reminders.minOfOrNull { it.time } }
        if (next == null) {
            cancelAlarm(context)
            return
        }
        val delay = (next - System.currentTimeMillis()).coerceAtLeast(0L)
        Utils.mainThread.postDelayed(tick, min(delay, 60_000L))

        try {
            val alarms = context.getSystemService(AlarmManager::class.java) ?: return
            try {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, alarmIntent(context))
            } catch (_: SecurityException) {
                // Exact alarms need a permission on newer targets; an inexact one still wakes the phone
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, alarmIntent(context))
            }
        } catch (e: Throwable) {
            logger.warn("Failed to set the reminder alarm", e)
        }
    }

    private fun alarmIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
        context,
        ALARM_REQUEST_CODE,
        Intent(ACTION_FIRE).setPackage(context.packageName),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun cancelAlarm(context: Context) {
        try {
            context.getSystemService(AlarmManager::class.java)?.cancel(alarmIntent(context))
        } catch (e: Throwable) {
            logger.warn("Failed to cancel the reminder alarm", e)
        }
    }

    private fun notify(context: Context, reminder: Reminder) {
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager == null || !manager.areNotificationsEnabled()) {
            // Without notification access the reminder would be lost, so show it in the chat instead
            BotMessages.send(reminder.channelId, "⏰ **${tr("Reminder")}**: ${reminder.text}")
            Utils.showToast("⏰ ${reminder.text}", true)
            return
        }
        if (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(CHANNEL_ID) == null) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, tr("Reminders"), NotificationManager.IMPORTANCE_HIGH)
            )
        }

        // Tapping the notification opens the channel the reminder was set in
        val guildId = StoreStream.getChannels().getChannel(reminder.channelId)?.guildId ?: 0L
        val open = IntentUtils.RouteBuilders.selectChannel(reminder.channelId, guildId, null)
            .setPackage(context.packageName)
            .takeIf { it.resolveActivity(context.packageManager) != null }
            ?: context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: return
        val contentIntent = PendingIntent.getActivity(
            context,
            reminder.id.toInt(),
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        @Suppress("DEPRECATION")
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL_ID) else Notification.Builder(context)
        val notification = builder
            .setSmallIcon(R.e.ic_notification_24dp)
            .setContentTitle(tr("Reminder"))
            .setContentText(reminder.text)
            .setStyle(Notification.BigTextStyle().bigText(reminder.text))
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setWhen(reminder.time)
            .setShowWhen(true)
            .build()
        manager.notify(NOTIFICATION_TAG, reminder.id.toInt(), notification)
    }

    private fun load(): List<Reminder> = try {
        val array = JSONArray(settings.getString(REMINDERS_KEY, "[]") ?: "[]")
        (0 until array.length()).mapNotNull { i ->
            val obj = array.optJSONObject(i) ?: return@mapNotNull null
            Reminder(obj.optLong("id", i.toLong()), obj.optString("text"), obj.optLong("time"), obj.optLong("channelId"))
        }
    } catch (e: Throwable) {
        logger.error("Failed to read saved reminders", e)
        emptyList()
    }

    /** Saves the reminders off the main thread. Serialised under the lock, so the last write always has the latest list. */
    private fun persist() {
        Utils.threadPool.execute {
            synchronized(lock) {
                val array = JSONArray()
                for (r in reminders) {
                    array.put(JSONObject().put("id", r.id).put("text", r.text).put("time", r.time).put("channelId", r.channelId))
                }
                settings.setString(REMINDERS_KEY, array.toString())
            }
        }
    }

    private companion object {
        const val REMINDERS_KEY = "reminders"
        const val ACTION_FIRE = "com.endcord.plugins.remindme.FIRE"
        const val CHANNEL_ID = "endcord_reminders"
        const val NOTIFICATION_TAG = "endcord_reminder"
        const val ALARM_REQUEST_CODE = 0x52454d44
    }
}
