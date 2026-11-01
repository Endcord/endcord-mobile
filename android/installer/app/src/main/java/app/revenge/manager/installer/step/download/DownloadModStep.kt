package app.revenge.manager.installer.step.download

import androidx.compose.runtime.Stable
import app.revenge.manager.BuildConfig
import app.revenge.manager.R
import app.revenge.manager.installer.step.StepRunner
import app.revenge.manager.installer.step.download.base.DownloadStep
import app.revenge.manager.installer.util.SignedRelease
import io.ktor.client.HttpClient
import org.koin.core.component.inject
import java.io.File

/**
 * Downloads the Endcord Xposed module published by the Build workflow to the `builds-next` branch. The module is
 * native code that goes into Discord, so it's only taken when the signed release next to it lists it, by size and
 * SHA-256, and it's fetched from the address of that build itself.
 */
@Stable
class DownloadModStep(
    workingDir: File
): DownloadStep() {

    private val http: HttpClient by inject()

    override val nameRes = R.string.step_dl_mod

    override val destination = preferenceManager.moduleLocation
    override val workingCopy = workingDir.resolve("xposed.apk")

    /** The signed release the module has to be listed in; none for a module the user picked themselves */
    private var release: SignedRelease? = null

    // The release's own address first, which the CDN can't answer with an older build; the branch's is what's left
    // when that one's gone, and the release still decides what's taken from it
    override val downloadFullUrl: String get() = release?.pinnedUrlOf(LOADER_FILE) ?: BuildConfig.LOADER_URL
    override val downloadFallbackUrl: String? get() = BuildConfig.LOADER_URL.takeIf { it != downloadFullUrl }

    override suspend fun run(runner: StepRunner) {
        // A module the user picked themselves (Developer settings) is theirs and stays as it is
        if (destination == preferenceManager.DEFAULT_MODULE_LOCATION) {
            val accepted = preferenceManager.releaseSequence.toLongOrNull() ?: 0
            release = SignedRelease.fetch(http, BuildConfig.LOADER_URL, accepted).also {
                runner.logger.i("The published build is signed release ${it.sequence}")
            }
        } else {
            runner.logger.i("Using the module at $destination as it is")
        }
        super.run(runner)
    }

    override suspend fun verify() {
        super.verify()
        release?.let {
            it.require(LOADER_FILE, destination)
            preferenceManager.releaseSequence = it.sequence.toString()
        }
    }

    private companion object {
        const val LOADER_FILE = "endcord-xposed.apk"
    }

}
