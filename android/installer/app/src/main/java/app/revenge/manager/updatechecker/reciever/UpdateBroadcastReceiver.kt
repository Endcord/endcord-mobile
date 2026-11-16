package app.revenge.manager.updatechecker.reciever

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import app.revenge.manager.BuildConfig
import app.revenge.manager.R
import app.revenge.manager.domain.manager.PreferenceManager
import app.revenge.manager.utils.Channels
import app.revenge.manager.utils.DiscordVersion
import app.revenge.manager.utils.Intents
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import java.util.UUID

class UpdateBroadcastReceiver : BroadcastReceiver(), KoinComponent {

    private val prefs: PreferenceManager by inject()

    override fun onReceive(context: Context, intent: Intent) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val versionCode = intent.getStringExtra(Intents.Extras.VERSION) ?: return
        val version = DiscordVersion.fromVersionCode(versionCode) ?: return
        // A newer Endcord on the same Discord (UpdateWorker), rather than a newer Discord
        val endcordUpdate = intent.getBooleanExtra(Intents.Extras.ENDCORD_UPDATE, false)

        val notificationId = if (endcordUpdate) ENDCORD_UPDATE_NOTIFICATION else versionCode.toInt()

        // Any app can send MainActivity an install intent; only this notification's carries the token the app keeps
        // for it, so only tapping the notification starts the install
        val token = UUID.randomUUID().toString()
        prefs.pendingInstallToken = token

        val clickIntent = PendingIntent.getActivity(
            context,
            notificationId,
            context.packageManager.getLaunchIntentForPackage(BuildConfig.APPLICATION_ID)!!.apply {
                action = Intents.Actions.INSTALL
                putExtra(Intents.Extras.VERSION, versionCode)
                putExtra(Intents.Extras.TOKEN, token)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            },
            // UPDATE_CURRENT: a notification already posted for this version keeps its intent otherwise, with the token
            // of an earlier run, which no longer matches the one just saved
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        NotificationCompat.Builder(context, Channels.UPDATE).apply {
            setSmallIcon(R.drawable.ic_update)
            setContentTitle(context.getString(if (endcordUpdate) R.string.title_endcord_update else R.string.title_update_available))
            setContentText(
                context.getString(
                    if (endcordUpdate) R.string.action_tap_to_install_endcord_update else R.string.action_tap_to_install,
                    version.toString()
                )
            )
            setContentIntent(clickIntent)
            setAutoCancel(true)
            // The check runs every few minutes and posts the same update again: it sounds once, not every time
            setOnlyAlertOnce(true)
            priority = NotificationCompat.PRIORITY_DEFAULT

            nm.notify(notificationId, build())
        }
    }

    private companion object {
        /** Discord's updates are posted under their version code; Endcord's, which keep the version, under this one */
        const val ENDCORD_UPDATE_NOTIFICATION = 1
    }

}
