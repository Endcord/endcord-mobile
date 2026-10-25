package com.endcord.installer.patcher

import com.endcord.installer.patcher.steps.download.*
import com.endcord.installer.patcher.steps.install.*
import com.endcord.installer.patcher.steps.patch.*
import com.endcord.installer.patcher.steps.prepare.*
import com.endcord.installer.ui.screens.patchopts.PatchOptions
import kotlinx.collections.immutable.persistentListOf

/**
 * Used for installing the old Kotlin Discord app.
 */
class KotlinPatchRunner(
    options: PatchOptions,
) : StepRunner() {
    override val steps = persistentListOf(
        // Prepare
        FetchInfoStep(),
        DowngradeCheckStep(options),
        RestoreDownloadsStep(),

        // Download
        DownloadDiscordStep(),
        DownloadInjectorStep(options.customInjector),
        DownloadAliuhookStep(),
        DownloadKotlinStep(),
        DownloadPatchesStep(options.customPatches),
        CopyDependenciesStep(),

        // Patch
        SmaliPatchStep(),
        PatchIconsStep(options),
        PatchManifestStep(options),
        PatchCertsStep(),
        ReorganizeDexStep(),
        AddAliuhookLibsStep(),
        SaveMetadataStep(options),

        // Install
        AlignmentStep(),
        SigningStep(options),
        InstallStep(options),
        CleanupStep(),
    )
}
