/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.notifycommon

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.view.View
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.api.NotificationsAPI
import com.aliucord.entities.NotificationData
import com.aliucord.i18n.I18n
import com.discord.app.AppActivity
import com.endcord.plugins.actionscommon.Common
import com.lytefast.flexinput.R

/**
 * Shows notifications for the notification plugins the way Endcord PC's notification API does: Discord's own
 * in-app notice at the top of the screen while the app is in front, and an Android notification (in its own
 * "Plugin notifications" channel, only when the user allows notifications) while it is in the background.
 */
internal object Notifier {
    private val logger = Logger("Notifier")
    private const val CHANNEL_ID = "endcord_plugin_notifications"
    private const val TAG = "EndcordPluginNotification"

    @Volatile
    private var channelCreated = false

    /** What a notification opens when tapped. */
    class Target(
        /** Channel to open, if any. */
        @JvmField val channelId: Long? = null,
        /** Message to jump to in [channelId]. */
        @JvmField val messageId: Long? = null,
        /** Custom action while the app is open, instead of opening [channelId]. */
        @JvmField val onClick: ((Context) -> Unit)? = null,
    )

    /**
     * Shows a notification.
     *
     * @param key identifies what the notification is about; a newer notification with the same key replaces
     *   the older one in the system tray
     * @param alsoSystem post the Android notification even while the app is in front, for things that must
     *   not be missed
     * @param seconds how long the in-app notice stays
     */
    fun show(
        key: String,
        title: CharSequence,
        body: CharSequence?,
        iconUrl: String? = null,
        target: Target = Target(),
        alsoSystem: Boolean = false,
        seconds: Int = 5,
    ) {
        Utils.mainThread.post {
            try {
                val background = NotifyHooks.isBackgrounded
                if (!background) inApp(title, body, iconUrl, target, seconds)
                if (background || alsoSystem) system(key, title, body, target)
            } catch (e: Throwable) {
                logger.error("Failed to show a notification", e)
            }
        }
    }

    /** Notification for a message, titled with its author and where it was sent. */
    fun message(owner: String, message: com.discord.api.message.Message, title: CharSequence? = null, seconds: Int = 5) {
        val channel = Msg.channel(message.g())
        val authorId = Msg.authorId(message)
        val guildId = message.m() ?: 0L
        val author = Msg.nameOf(authorId, guildId, message.e())
        val place = channel?.let { Msg.placeOf(it) }.orEmpty()
        show(
            key = "$owner:${message.g()}",
            title = title ?: if (place.isEmpty()) author else "$author ($place)",
            body = Msg.readable(message),
            iconUrl = Msg.avatarOf(authorId),
            target = Target(message.g(), message.o()),
            seconds = seconds,
        )
    }

    private fun inApp(title: CharSequence, body: CharSequence?, iconUrl: String?, target: Target, seconds: Int) {
        val data = NotificationData()
            .setTitle(title)
            .setBody(body)
            .setAutoDismissPeriodSecs(seconds.coerceIn(1, 60))
        if (iconUrl != null) data.setIconUrl(iconUrl) else data.setIconResId(R.e.ic_notification_24dp)
        val custom = target.onClick
        val channelId = target.channelId
        if (custom != null) {
            data.setOnClick { view: View -> runAction(custom, view.context) }
        } else if (channelId != null) {
            data.setOnClick { view: View -> Common.openMessage(view.context, channelId, target.messageId) }
        }
        NotificationsAPI.display(data)
    }

    private fun runAction(action: (Context) -> Unit, context: Context) {
        try {
            action(context)
        } catch (e: Throwable) {
            logger.error("Notification action failed", e)
        }
    }

    private fun system(key: String, title: CharSequence, body: CharSequence?, target: Target) {
        val context = Utils.appContext.applicationContext
        val manager = NotificationManagerCompat.from(context)
        // Covers notifications turned off for the app and Android 13's notification permission not granted
        if (!manager.areNotificationsEnabled()) return
        ensureChannel(context)

        val channelId = target.channelId
        val intent = if (channelId != null) {
            Common.routeIntent(context, channelId, target.messageId)
        } else {
            context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?: Intent(context, AppActivity.Main::class.java)
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val open = PendingIntent.getActivity(
            context,
            key.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.e.ic_notification_message_24dp)
            .setContentTitle(title)
            .setContentIntent(open)
            .setAutoCancel(true)
            .setOnlyAlertOnce(false)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
        if (!body.isNullOrEmpty()) {
            builder.setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body))
        }
        try {
            manager.notify(TAG, key.hashCode(), builder.build())
        } catch (e: SecurityException) {
            logger.error("Not allowed to post a notification", e)
        }
    }

    private fun ensureChannel(context: Context) {
        if (channelCreated || Build.VERSION.SDK_INT < 26) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            val channel = NotificationChannel(CHANNEL_ID, I18n.t("Plugin notifications"), NotificationManager.IMPORTANCE_HIGH)
            channel.description = I18n.t("Notifications from Endcord plugins such as MessageNotifier and RelationshipNotifier")
            manager.createNotificationChannel(channel)
        }
        channelCreated = true
    }
}
