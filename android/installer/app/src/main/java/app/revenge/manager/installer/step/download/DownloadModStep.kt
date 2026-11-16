package app.revenge.manager.installer.step.download

import androidx.compose.runtime.Stable
import app.revenge.manager.BuildConfig
import app.revenge.manager.R
import app.revenge.manager.installer.step.StepRunner
import app.revenge.manager.installer.step.download.base.DownloadStep
import app.revenge.manager.installer.util.SignedRelease
import app.revenge.manager.utils.mainThread
import app.revenge.manager.utils.showToast
import android.content.Context
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
    private val context: Context by inject()

    override val nameRes = R.string.step_dl_mod

    override val destination = preferenceManager.moduleLocation
    override val workingCopy = workingDir.resolve("xposed.apk")

    /** The signed release the module has to be listed in; none for a module the user picked themselves */
    private var release: SignedRelease? = null

    /** The SHA-256 of the signed loader this install takes, once checked; null for a module the user picked themselves */
    var signedLoaderSha256: String? = null
        private set

    // The release's own address first, which the CDN can't answer with an older build; the branch's is what's left
    // when that one's gone, and the release still decides what's taken from it
    override val downloadFullUrl: String get() = release?.pinnedUrlOf(LOADER_FILE) ?: BuildConfig.LOADER_URL
    override val downloadFallbackUrl: String? get() = BuildConfig.LOADER_URL.takeIf { it != downloadFullUrl }

    override suspend fun run(runner: StepRunner) {
        // The same file however its path is spelled: another spelling of the default isn't a module of the user's own
        val isDefault = runCatching {
            destination.canonicalFile == preferenceManager.DEFAULT_MODULE_LOCATION.canonicalFile
        }.getOrDefault(false)

        // A module the user picked themselves (Developer settings) is theirs and stays as it is
        if (isDefault) {
            val accepted = preferenceManager.releaseSequence.toLongOrNull() ?: 0
            release = SignedRelease.fetch(http, BuildConfig.LOADER_URL, accepted).also {
                runner.logger.i("The published build is signed release ${it.sequence}")
            }
        } else {
            // Only taken from where the user put it: nothing is downloaded there, since nothing would check that
            // download against the signed release
            if (!destination.isFile || destination.length() == 0L) {
                throw IllegalStateException(
                    "There's no module at $destination. Put one there, or reset the module location in Developer settings."
                )
            }
            // Said every time, not only in the log: nothing checks this file against Endcord's signed release
            runner.logger.i("Using the module at $destination as it is; it isn't checked against the signed release")
            mainThread { context.showToast(R.string.msg_unsigned_module) }
        }
        super.run(runner)
    }

    override suspend fun verify() {
        super.verify()
        release?.let {
            it.require(LOADER_FILE, destination)
            preferenceManager.releaseSequence = it.sequence.toString()
            signedLoaderSha256 = it.sha256Of(LOADER_FILE)
        }
    }

    companion object {
        /** The loader's name in a signed release */
        const val LOADER_FILE = "endcord-xposed.apk"
    }

}
