package app.revenge.manager.installer.step.download

import androidx.compose.runtime.Stable
import app.revenge.manager.R
import app.revenge.manager.installer.step.download.base.DownloadStep
import java.io.File

/**
 * Downloads the Endcord Xposed module published by the Build workflow to the `builds` branch
 */
@Stable
class DownloadModStep(
    workingDir: File
): DownloadStep() {

    override val nameRes = R.string.step_dl_mod

    override val downloadFullUrl: String = "https://raw.githubusercontent.com/rootpoii/endcord-android/builds/endcord-xposed.apk"
    override val destination = preferenceManager.moduleLocation
    override val workingCopy = workingDir.resolve("xposed.apk")

}
