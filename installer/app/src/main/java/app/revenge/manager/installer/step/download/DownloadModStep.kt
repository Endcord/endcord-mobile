package app.revenge.manager.installer.step.download

import androidx.compose.runtime.Stable
import app.revenge.manager.BuildConfig
import app.revenge.manager.R
import app.revenge.manager.domain.repository.RestRepository
import app.revenge.manager.installer.step.StepRunner
import app.revenge.manager.installer.step.download.base.DownloadStep
import app.revenge.manager.network.utils.ifSuccessful
import org.koin.core.component.inject
import java.io.File

/**
 * Downloads the Endcord Xposed module published by the Build workflow to the `builds` branch
 */
@Stable
class DownloadModStep(
    workingDir: File
): DownloadStep() {

    private val repo: RestRepository by inject()

    override val nameRes = R.string.step_dl_mod

    override val downloadFullUrl: String = BuildConfig.LOADER_URL
    override val destination = preferenceManager.moduleLocation
    override val workingCopy = workingDir.resolve("xposed.apk")

    override suspend fun run(runner: StepRunner) {
        // Each build of the loader replaces the cached one. Checked here, at install time, since the installer can stay
        // open across builds; a module the user picked themselves (Developer settings) is theirs and stays.
        if (destination == preferenceManager.DEFAULT_MODULE_LOCATION) repo.getBuildInfo().ifSuccessful {
            val version = "${it.loaderVersion}-${it.commit.take(7)}"
            if (preferenceManager.moduleVersion != version) {
                runner.logger.i("New loader build $version, replacing the cached one")
                destination.delete()
                preferenceManager.moduleVersion = version
            }
        }
        super.run(runner)
    }

}
