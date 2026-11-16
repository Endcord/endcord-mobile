package app.revenge.manager.installer.session

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageInstaller.SessionParams
import android.content.pm.PackageManager
import android.os.Build
import app.revenge.manager.installer.Installer
import java.io.File

internal class SessionInstaller(private val context: Context) : Installer {

    private val packageManager: PackageManager = context.packageManager

    /**
     * Installs [apks] as one app and returns once Android installed it. Throws when the user canceled the install or
     * Android refused it, and abandons the session when this is canceled before Android answered.
     */
    override suspend fun installApks(silent: Boolean, vararg apks: File) {
        val params = SessionParams(SessionParams.MODE_FULL_INSTALL).apply {
            if (Build.VERSION.SDK_INT >= 31) {
                setInstallScenario(PackageManager.INSTALL_SCENARIO_FAST)

                if (silent) {
                    setRequireUserAction(SessionParams.USER_ACTION_NOT_REQUIRED)
                }
            }
        }

        val packageInstaller = packageManager.packageInstaller
        val sessionId = packageInstaller.createSession(params)
        val answer = InstallResults.expect(sessionId)

        try {
            packageInstaller.openSession(sessionId).use { session ->
                // Streamed: Discord's base APK is over 100 MB, too much to hold in memory on some phones
                apks.forEach { apk ->
                    session.openWrite(apk.name, 0, apk.length()).use { out ->
                        apk.inputStream().use { it.copyTo(out) }
                        session.fsync(out)
                    }
                }

                val callbackIntent = Intent(context, InstallService::class.java).apply {
                    action = InstallService.ACTION_INSTALL
                }

                // One per session, so the answers of two installs can't be mixed up
                @SuppressLint("UnspecifiedImmutableFlag")
                val contentIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    PendingIntent.getService(context, sessionId, callbackIntent, PendingIntent.FLAG_MUTABLE)
                } else {
                    PendingIntent.getService(context, sessionId, callbackIntent, 0)
                }

                session.commit(contentIntent.intentSender)
            }

            val result = answer.await()
            when (result.status) {
                PackageInstaller.STATUS_SUCCESS -> Unit
                PackageInstaller.STATUS_FAILURE_ABORTED -> throw InstallFailedException("The install was canceled")
                else -> throw InstallFailedException(
                    "Android didn't install the app (status ${result.status}): ${result.message ?: "no reason given"}"
                )
            }
        } catch (e: Throwable) {
            InstallResults.forget(sessionId)
            // A session nobody waits for anymore isn't left behind: an install the user leaves stops here too
            if (e !is InstallFailedException) runCatching { packageInstaller.abandonSession(sessionId) }
            throw e
        }
    }
}

/** Android didn't install the app: the user canceled it, or Android refused it */
class InstallFailedException(message: String) : Exception(message)
