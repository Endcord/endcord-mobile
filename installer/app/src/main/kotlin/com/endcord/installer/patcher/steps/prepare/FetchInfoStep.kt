package com.endcord.installer.patcher.steps.prepare

import androidx.compose.runtime.Stable
import com.endcord.installer.R
import com.endcord.installer.network.models.BuildInfo
import com.endcord.installer.network.services.EndcordGithubService
import com.endcord.installer.network.services.AliucordMavenService
import com.endcord.installer.network.utils.SemVer
import com.endcord.installer.network.utils.getOrThrow
import com.endcord.installer.patcher.StepRunner
import com.endcord.installer.patcher.steps.StepGroup
import com.endcord.installer.patcher.steps.base.Step
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject

/**
 * Fetches versions data from various sources to be used during the installation.
 */
@Stable
class FetchInfoStep : Step(), KoinComponent {
    private val github: EndcordGithubService by inject()
    private val maven: AliucordMavenService by inject()

    override val group = StepGroup.Prepare
    override val localizedName = R.string.patch_step_fetch_kt_version

    /**
     * Remote build data about the latest versions of components.
     */
    lateinit var data: BuildInfo
        private set

    /**
     * Remote data about the latest Aliuhook version available from the Aliucord maven.
     */
    lateinit var aliuhookVersion: SemVer
        private set

    override suspend fun execute(container: StepRunner) {
        container.log("Fetching ${EndcordGithubService.DATA_JSON_URL}")
        data = github.getBuildData(force = true).getOrThrow()
        container.log("Fetched build data: $data")

        container.log("Obtaining latest aliuhook version")
        aliuhookVersion = maven.getAliuhookVersion(force = true).getOrThrow()
        container.log("Fetched aliuhook version: $aliuhookVersion")
    }
}
