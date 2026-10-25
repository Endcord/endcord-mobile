package com.endcord.installer.patcher.steps.download

import com.endcord.installer.network.services.EndcordGithubService
import androidx.compose.runtime.Stable
import com.endcord.installer.R
import com.endcord.installer.manager.PathManager
import com.endcord.installer.network.utils.SemVer
import com.endcord.installer.patcher.StepRunner
import com.endcord.installer.patcher.steps.base.*
import com.endcord.installer.patcher.steps.patch.ReorganizeDexStep
import com.endcord.installer.patcher.steps.prepare.FetchInfoStep
import com.endcord.installer.ui.screens.componentopts.PatchComponent
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import java.io.FileNotFoundException

/**
 * Download a compiled dex file to be injected into the APK as the first `classes.dex` to override an entry point class.
 * Provides [ReorganizeDexStep] with the dex through the [IDexProvider] implementation.
 */
@Stable
class DownloadInjectorStep(
    private val custom: PatchComponent?,
) : DownloadStep<SemVer>(), IDexProvider, KoinComponent {
    private val paths: PathManager by inject()

    override val localizedName = R.string.patch_step_dl_injector

    override fun getRemoteUrl(container: StepRunner) = URL

    override fun getVersion(container: StepRunner) =
        custom?.version ?: container.getStep<FetchInfoStep>().data.injectorVersion

    override fun getStoredFile(container: StepRunner) =
        custom?.getFile(paths) ?: paths.cachedInjector(getVersion(container))

    override val dexCount = 1
    override val dexPriority = 3
    override fun getDexFiles(container: StepRunner) =
        listOf(getStoredFile(container).readBytes())

    override suspend fun execute(container: StepRunner) {
        if (custom != null) {
            container.log("Using custom injector with version ${custom.version} built ${custom.timestamp}")

            if (!custom.getFile(paths).exists()) {
                throw FileNotFoundException(
                    "Selected custom component does not exist on disk! If this is an update, " +
                        "updates cannot occur when the originally selected custom component has been deleted."
                )
            }

            state = StepState.Skipped
            return
        }

        super.execute(container)
    }

    private companion object {
        const val URL = "${EndcordGithubService.BUILDS_URL}/Injector.dex"
    }
}
