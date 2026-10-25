package app.revenge.manager.updatechecker.worker

import app.revenge.manager.domain.manager.DiscordSource
import app.revenge.manager.utils.InstalledDiscord
import android.content.Context
import android.content.Intent
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.revenge.manager.domain.manager.InstallManager
import app.revenge.manager.domain.manager.PreferenceManager
import app.revenge.manager.domain.repository.RestRepository
import app.revenge.manager.network.utils.ApiResponse
import app.revenge.manager.updatechecker.reciever.UpdateBroadcastReceiver
import app.revenge.manager.utils.DiscordVersion
import app.revenge.manager.utils.Intents
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject

class UpdateWorker(
    private val context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params), KoinComponent {

    val api: RestRepository by inject()
    val prefs: PreferenceManager by inject()
    val installManager: InstallManager by inject()

    override suspend fun doWork(): Result {
        if (prefs.discordVersion.isNotBlank()) return Result.success()

        // The worker outlives the screens, so the installed Endcord is looked up again each time
        installManager.getInstalled()
        val currentVersion = DiscordVersion.fromVersionCode(installManager.current?.versionCode.toString())
            ?: return Result.success()

        // Built from the Discord on the phone: an update is due when the Play Store updated that Discord
        val installedDiscord = InstalledDiscord.version(context)
        if (prefs.discordSource == DiscordSource.INSTALLED && installedDiscord != null) {
            if (installedDiscord > currentVersion) notifyUpdate(installedDiscord)
            return Result.success()
        }

        return when (val res = api.getLatestDiscordVersions()) {
            is ApiResponse.Success -> {
                val latestVersion = res.data[prefs.channel] ?: return Result.success()
                if (latestVersion > currentVersion) notifyUpdate(latestVersion)
                Result.success()
            }

            else -> Result.retry()
        }
    }

    private fun notifyUpdate(version: DiscordVersion) {
        context.sendBroadcast(
            Intent(context, UpdateBroadcastReceiver::class.java).apply {
                putExtra(Intents.Extras.VERSION, version.toVersionCode())
            }
        )
    }

}