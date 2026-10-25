package com.endcord.installer.patcher.steps.patch

import com.endcord.installer.BuildConfig
import com.endcord.installer.R
import com.endcord.installer.network.utils.SemVer
import com.endcord.installer.patcher.InstallMetadata
import com.endcord.installer.patcher.StepRunner
import com.endcord.installer.patcher.steps.StepGroup
import com.endcord.installer.patcher.steps.base.Step
import com.endcord.installer.patcher.steps.download.*
import com.endcord.installer.ui.screens.patchopts.PatchOptions
import com.github.diamondminer88.zip.ZipWriter
import kotlinx.serialization.json.Json
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject

/**
 * Store the install options and additional data inside the APK for future use,
 * for example checking what library versions were used, or performing "updates" while
 * maintaining the same install options as what was used upon first install.
 */
class SaveMetadataStep(private val options: PatchOptions) : Step(), KoinComponent {
    private val json: Json by inject()

    override val group = StepGroup.Patch
    override val localizedName = R.string.patch_step_save_metadata

    override suspend fun execute(container: StepRunner) {
        val apk = container.getStep<CopyDependenciesStep>().apk
        val aliuhook = container.getStep<DownloadAliuhookStep>()
        val injector = container.getStep<DownloadInjectorStep>()
        val patches = container.getStep<DownloadPatchesStep>()
        val kotlin = container.getStep<DownloadKotlinStep>()

        val metadata = InstallMetadata(
            customManager = !BuildConfig.RELEASE,
            managerVersion = SemVer.parse(BuildConfig.VERSION_NAME),
            aliuhookVersion = aliuhook.getVersion(container),
            injectorVersion = injector.getVersion(container),
            patchesVersion = patches.getVersion(container),
            kotlinVersion = kotlin.getVersion(container),
            options = options,
        )

        container.log("Writing serialized install metadata to APK")
        ZipWriter(apk, /* append = */ true).use {
            it.writeEntry("endcord.json", json.encodeToString<InstallMetadata>(metadata))
        }
    }
}
