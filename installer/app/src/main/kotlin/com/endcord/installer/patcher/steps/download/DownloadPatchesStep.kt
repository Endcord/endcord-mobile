package com.endcord.installer.patcher.steps.download

import com.endcord.installer.network.services.EndcordGithubService
import androidx.compose.runtime.Stable
import com.endcord.installer.R
import com.endcord.installer.manager.PathManager
import com.endcord.installer.network.utils.SemVer
import com.endcord.installer.patcher.StepRunner
import com.endcord.installer.patcher.steps.base.DownloadStep
import com.endcord.installer.patcher.steps.base.StepState
import com.endcord.installer.patcher.steps.prepare.FetchInfoStep
import com.endcord.installer.ui.screens.componentopts.PatchComponent
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import java.io.FileNotFoundException

/**
 * Download a zip of all the smali patches to be applied to the APK during patching.
 */
@Stable
class DownloadPatchesStep(
    private val custom: PatchComponent?,
) : DownloadStep<SemVer>(), KoinComponent {
    private val paths: PathManager by inject()

    override val localizedName = R.string.patch_step_dl_smali

    override fun getRemoteUrl(container: StepRunner) = URL

    override fun getVersion(container: StepRunner) =
        custom?.version ?: container.getStep<FetchInfoStep>().data.patchesVersion

    override fun getStoredFile(container: StepRunner) =
        custom?.getFile(paths) ?: paths.cachedSmaliPatches(getVersion(container))

    override suspend fun execute(container: StepRunner) {
        if (custom != null) {
            container.log("Using custom patches with version ${custom.version} built ${custom.timestamp}")

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
        const val URL = "${EndcordGithubService.BUILDS_URL}/patches.zip"
    }
}
