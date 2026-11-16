package app.revenge.manager.installer.session

import android.app.Service
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.IBinder
import app.revenge.manager.R
import app.revenge.manager.utils.showToast

class InstallService : Service() {

    private val messages = mapOf(
        PackageInstaller.STATUS_FAILURE to R.string.install_fail_generic,
        PackageInstaller.STATUS_FAILURE_BLOCKED to R.string.install_fail_blocked,
        PackageInstaller.STATUS_FAILURE_INVALID to R.string.install_fail_invalid,
        PackageInstaller.STATUS_FAILURE_CONFLICT to R.string.install_fail_conflict,
        PackageInstaller.STATUS_FAILURE_STORAGE to R.string.install_fail_storage,
        PackageInstaller.STATUS_FAILURE_INCOMPATIBLE to R.string.install_fail_incompatible,
        8 /* STATUS_FAILURE_TIMEOUT (Added in Android 14) */ to R.string.install_fail_timeout
    )

    override fun onStartCommand(intent: Intent, flags: Int, startId: Int): Int {
        val isInstall = intent.action == ACTION_INSTALL
        when (val statusCode = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION") // No.
                val confirmationIntent = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)!!
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

                startActivity(confirmationIntent)
            }

            else -> if (isInstall) {
                when (statusCode) {
                    PackageInstaller.STATUS_SUCCESS -> showToast(R.string.installer_success)
                    PackageInstaller.STATUS_FAILURE_ABORTED -> showToast(R.string.installer_aborted)
                    else -> messages[statusCode]?.let(::showToast)
                }

                // The installer waiting on the session learns how it ended, with Android's reason for the logs. It's
                // handed over in the process: an exported activity would take the same message from any app
                InstallResults.complete(
                    sessionId = intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1),
                    status = statusCode,
                    message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE),
                )
            }
        }

        stopSelf()
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent): IBinder? = null

    companion object {
        const val ACTION_INSTALL = "revenge.actions.ACTION_INSTALL"
    }
}
