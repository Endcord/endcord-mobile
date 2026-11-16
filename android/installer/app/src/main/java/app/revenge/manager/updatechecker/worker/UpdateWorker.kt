package app.revenge.manager.updatechecker.worker

import android.content.Context
import android.content.Intent
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.revenge.manager.domain.manager.DiscordSource
import app.revenge.manager.domain.manager.InstallManager
import app.revenge.manager.domain.manager.PreferenceManager
import app.revenge.manager.domain.repository.RestRepository
import app.revenge.manager.network.utils.ApiResponse
import app.revenge.manager.updatechecker.newerPublishedLoader
import app.revenge.manager.updatechecker.reciever.UpdateBroadcastReceiver
import app.revenge.manager.utils.DiscordVersion
import app.revenge.manager.utils.InstalledDiscord
import app.revenge.manager.utils.Intents
import io.ktor.client.HttpClient
import kotlinx.coroutines.CancellationException
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject

class UpdateWorker(
    private val context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params), KoinComponent {

    val api: RestRepository by inject()
    val prefs: PreferenceManager by inject()
    val installManager: InstallManager by inject()
    private val http: HttpClient by inject()

    override suspend fun doWork(): Result {
        // The worker outlives the screens, so the installed Endcord is looked up again each time
        installManager.getInstalled()
        val currentVersion = DiscordVersion.fromVersionCode(installManager.current?.versionCode.toString())
            ?: return Result.success()

        var retry = false
        val newerDiscord = when {
            // A Discord version picked in the settings stays
            prefs.discordVersion.isNotBlank() -> null

            // Built from the Discord on the phone: an update is due when the Play Store updated that Discord
            prefs.discordSource == DiscordSource.INSTALLED && InstalledDiscord.version(context) != null ->
                InstalledDiscord.version(context)?.takeIf { it > currentVersion }

            else -> when (val res = api.getLatestDiscordVersions()) {
                is ApiResponse.Success -> res.data[prefs.channel]?.takeIf { it > currentVersion }
                else -> null.also { retry = true }
            }
        }

        // Installing a newer Discord brings the newest Endcord too
        if (newerDiscord != null) notifyUpdate(newerDiscord, endcord = false)
        else checkEndcordUpdate(currentVersion)

        return if (retry) Result.retry() else Result.success()
    }

    /**
     * The same Discord, with a newer Endcord loader published: Endcord's JavaScript updates itself, its loader only
     * comes with installing again. Said once for each published loader, not every time the check runs.
     */
    private suspend fun checkEndcordUpdate(currentVersion: DiscordVersion) {
        val published = try {
            newerPublishedLoader(http, prefs)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Offline, or no valid release: the next check sees it
            null
        } ?: return
        if (published == prefs.notifiedLoaderSha256) return
        prefs.notifiedLoaderSha256 = published
        notifyUpdate(currentVersion, endcord = true)
    }

    private fun notifyUpdate(version: DiscordVersion, endcord: Boolean) {
        context.sendBroadcast(
            Intent(context, UpdateBroadcastReceiver::class.java).apply {
                putExtra(Intents.Extras.VERSION, version.toVersionCode())
                putExtra(Intents.Extras.ENDCORD_UPDATE, endcord)
            }
        )
    }

}
