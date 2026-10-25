package com.endcord.installer.ui.screens.about

import cafe.adriel.voyager.core.model.StateScreenModel
import cafe.adriel.voyager.core.model.screenModelScope
import com.endcord.installer.network.services.EndcordGithubService
import com.endcord.installer.network.utils.fold
import com.endcord.installer.ui.util.toUnsafeImmutable
import com.endcord.installer.util.launchIO

class AboutModel(
    private val endcordGithubService: EndcordGithubService,
) : StateScreenModel<AboutScreenState>(AboutScreenState.Loading) {
    init {
        fetchContributors()
    }

    fun fetchContributors() = screenModelScope.launchIO {
        mutableState.value = AboutScreenState.Loading

        val response = endcordGithubService.getContributors()

        mutableState.value = response.fold(
            success = { contributors ->
                AboutScreenState.Loaded(contributors.toUnsafeImmutable())
            },
            fail = { AboutScreenState.Failure },
        )
    }
}
