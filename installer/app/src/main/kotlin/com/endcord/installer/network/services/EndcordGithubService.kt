package com.endcord.installer.network.services

import com.endcord.installer.BuildConfig
import com.endcord.installer.di.cacheControl
import com.endcord.installer.network.models.*
import com.endcord.installer.network.utils.ApiResponse
import io.ktor.client.request.url
import io.ktor.http.CacheControl

class EndcordGithubService(
    private val http: HttpService,
) {
    /**
     * Fetches the build data of Endcord (excluding Aliuhook).
     * @param force Whether to force Ktor to refetch/revalidate cache.
     */
    suspend fun getBuildData(force: Boolean = false): ApiResponse<BuildInfo> = http.request {
        url(DATA_JSON_URL)

        if (force) {
            cacheControl(CacheControl.NoCache(null))
        }
    }

    /**
     * Fetches all the Manager releases with a 60s local cache.
     */
    suspend fun getManagerReleases(): ApiResponse<List<GithubRelease>> {
        return http.request {
            url("https://api.github.com/repos/$REPO/releases")
            cacheControl(CacheControl.MaxAge(maxAgeSeconds = 60))
        }
    }

    /**
     * Fetches all the contributors with a 24h local cache.
     */
    suspend fun getContributors(): ApiResponse<List<Contributor>> = http.request {
        url(CONTRIBUTORS_JSON_URL)
        cacheControl(CacheControl.MaxAge(maxAgeSeconds = 60 * 60 * 24))
    }

    companion object {
        /** `owner/name` of the Endcord mobile repository, which hosts both the builds and the installer releases. */
        const val REPO = BuildConfig.GITHUB_REPO

        /** Base url of the builds published by CI to the `builds` branch. */
        const val BUILDS_URL = "https://raw.githubusercontent.com/$REPO/builds"

        const val DATA_JSON_URL = "$BUILDS_URL/data.json"

        private const val CONTRIBUTORS_JSON_URL = "$BUILDS_URL/contributors.json"
    }
}
