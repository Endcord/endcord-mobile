/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagereminders

import android.app.Activity
import android.app.AlarmManager
import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.view.View
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.api.NotificationsAPI
import com.aliucord.entities.NotificationData
import com.aliucord.i18n.I18n
import com.endcord.plugins.actionscommon.Common
import com.lytefast.flexinput.R

/**
 * Fires due reminders.
 *
 * Endcord can't add components to Discord's manifest, so there is no receiver Android could start the app
 * for. Instead an [AlarmManager] alarm targets a receiver registered while the plugin runs: it wakes the
 * device and delivers the reminder on time while Android keeps the app's process alive, also in the
 * background and in Doze. Exact alarms are used when the app may schedule them (always before Android 12),
 * otherwise Android may deliver the alarm a few minutes late. If the process was killed in between, overdue
 * reminders fire as soon as Endcord is opened again: they are checked on start and whenever an activity
 * resumes.
 */
internal class ReminderScheduler(private val plugin: MessageReminders) {
    private val logger = Logger("MessageReminders")
    private val context: Context = Utils.appContext.applicationContext
    private val action = "${context.packageName}.endcord.MESSAGE_REMINDER"
    private val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private val handler = Utils.mainThread
    private val checkRunnable = Runnable { checkDue() }
    private var receiver: BroadcastReceiver? = null
    private var callbacks: Application.ActivityLifecycleCallbacks? = null

    fun start() {
        createChannel()

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context, intent: Intent) = checkDue()
        }
        val filter = IntentFilter(action)
        if (Build.VERSION.SDK_INT >= 33) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(receiver, filter)
        }
        this.receiver = receiver

        val callbacks = object : Application.ActivityLifecycleCallbacks {
            override fun onActivityResumed(activity: Activity) = checkDue()
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
            override fun onActivityStarted(activity: Activity) {}
            override fun onActivityPaused(activity: Activity) {}
            override fun onActivityStopped(activity: Activity) {}
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
            override fun onActivityDestroyed(activity: Activity) {}
        }
        (context as? Application)?.registerActivityLifecycleCallbacks(callbacks)
        this.callbacks = callbacks

        checkDue()
    }

    fun stop() {
        cancel()
        receiver?.let {
            try {
                context.unregisterReceiver(it)
            } catch (_: Throwable) {
            }
        }
        receiver = null
        callbacks?.let { (context as? Application)?.unregisterActivityLifecycleCallbacks(it) }
        callbacks = null
    }

    /** Points the alarm at the next reminder, or removes it when there is none. */
    fun reschedule() {
        cancel()
        if (receiver == null) return
        val next = plugin.store.all().minByOrNull { it.remindAt } ?: return
        val at = next.remindAt
        try {
            val pending = alarmIntent()
            if (Build.VERSION.SDK_INT >= 31 && !alarms.canScheduleExactAlarms()) {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
            } else {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
            }
        } catch (e: Throwable) {
            logger.error("Failed to schedule the reminder alarm", e)
        }
        // Backup for the foreground, in case the system holds back the alarm broadcast
        handler.postDelayed(checkRunnable, (at - System.currentTimeMillis()).coerceAtLeast(0L) + 500L)
    }

    private fun cancel() {
        handler.removeCallbacks(checkRunnable)
        try {
            alarms.cancel(alarmIntent())
        } catch (_: Throwable) {
        }
    }

    private fun alarmIntent(): PendingIntent = PendingIntent.getBroadcast(
        context,
        ALARM_REQUEST,
        Intent(action).setPackage(context.packageName),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun checkDue() {
        try {
            val now = System.currentTimeMillis()
            val due = plugin.store.all().filter { it.remindAt <= now }
            if (due.isNotEmpty()) {
                val ids = due.map { it.id }.toHashSet()
                plugin.store.removeIf { it.id in ids }
                due.sortedBy { it.remindAt }.forEach { fire(it) }
            }
            reschedule()
        } catch (e: Throwable) {
            logger.error("Failed to check reminders", e)
        }
    }

    private fun fire(reminder: Reminder) {
        val title = I18n.t("Reminder: message from {author}", "author" to reminder.author)
        val body = reminder.content.ifEmpty { I18n.t("Jump to the message you saved.") }
        val manager = NotificationManagerCompat.from(context)

        if (!manager.areNotificationsEnabled()) {
            // Without notification access, show it inside the app instead
            NotificationsAPI.display(NotificationData().setTitle(title).setBody(body).setOnClick { view: View ->
                Common.openMessage(view.context, reminder.channelId, reminder.messageId)
            })
            return
        }

        val open = PendingIntent.getActivity(
            context,
            reminder.id.hashCode(),
            Common.routeIntent(context, reminder.channelId, reminder.messageId).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.e.ic_notification_message_24dp)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(open)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        try {
            manager.notify(NOTIFICATION_TAG, reminder.id.hashCode(), notification)
        } catch (e: SecurityException) {
            logger.error("Not allowed to post the reminder", e)
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(CHANNEL_ID, I18n.t("Message reminders"), NotificationManager.IMPORTANCE_HIGH)
        channel.description = I18n.t("Reminders you set on messages with Endcord")
        manager.createNotificationChannel(channel)
    }

    private companion object {
        const val CHANNEL_ID = "endcord_message_reminders"
        const val NOTIFICATION_TAG = "EndcordReminder"
        const val ALARM_REQUEST = 0x52454D // "REM"
    }
}
