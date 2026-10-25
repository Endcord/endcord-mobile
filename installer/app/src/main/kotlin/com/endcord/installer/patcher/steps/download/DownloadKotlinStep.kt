package com.endcord.installer.patcher.steps.download

import com.endcord.installer.network.services.EndcordGithubService
import androidx.compose.runtime.Stable
import com.endcord.installer.R
import com.endcord.installer.manager.PathManager
import com.endcord.installer.network.utils.SemVer
import com.endcord.installer.patcher.StepRunner
import com.endcord.installer.patcher.steps.base.DownloadStep
import com.endcord.installer.patcher.steps.base.IDexProvider
import com.endcord.installer.patcher.steps.patch.ReorganizeDexStep
import com.endcord.installer.patcher.steps.prepare.FetchInfoStep
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject

/**
 * Download the most recent available Kotlin stdlib build that is supported.
 * Provides [ReorganizeDexStep] with the dex through the [IDexProvider] implementation.
 */
@Stable
class DownloadKotlinStep : DownloadStep<SemVer>(), IDexProvider, KoinComponent {
    private val paths: PathManager by inject()

    override val localizedName = R.string.patch_step_dl_kotlin

    override fun getRemoteUrl(container: StepRunner) = URL

    override fun getVersion(container: StepRunner) =
        container.getStep<FetchInfoStep>().data.kotlinVersion

    override fun getStoredFile(container: StepRunner) =
        paths.cachedKotlinDex(getVersion(container))

    override val dexCount = 1
    override val dexPriority = -1
    override fun getDexFiles(container: StepRunner) =
        listOf(getStoredFile(container).readBytes())

    private companion object {
        const val URL = "${EndcordGithubService.BUILDS_URL}/kotlin.dex"
    }
}
