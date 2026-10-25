package com.endcord.installer.patcher.steps.install

import com.endcord.installer.R
import com.endcord.installer.manager.PathManager
import com.endcord.installer.manager.PreferencesManager
import com.endcord.installer.patcher.StepRunner
import com.endcord.installer.patcher.steps.StepGroup
import com.endcord.installer.patcher.steps.base.Step
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject

/**
 * Cleanup patching working directory once the installation has completed.
 */
class CleanupStep : Step(), KoinComponent {
    private val paths: PathManager by inject()
    private val prefs: PreferencesManager by inject()

    override val group = StepGroup.Install
    override val localizedName = R.string.patch_step_cleanup

    override suspend fun execute(container: StepRunner) {
        container.log("Moving downloads back to cache")
        paths.patchingDownloadDir.renameTo(paths.cacheDownloadDir)

        if (prefs.keepPatchedApks) {
            container.log("keepPatchedApks enabled, keeping working dir")
        } else {
            container.log("Deleting patching working dir")
            if (!paths.patchingWorkingDir.deleteRecursively())
                throw IllegalStateException("Failed to delete patching working dir")
        }
    }
}
