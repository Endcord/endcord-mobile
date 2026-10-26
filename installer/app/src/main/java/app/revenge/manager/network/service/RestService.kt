package app.revenge.manager.network.service

import app.revenge.manager.BuildConfig
import app.revenge.manager.domain.manager.PreferenceManager
import app.revenge.manager.network.dto.BuildInfo
import app.revenge.manager.network.dto.Commit
import app.revenge.manager.network.dto.Index
import app.revenge.manager.network.dto.Release
import io.ktor.client.request.parameter
import io.ktor.client.request.url
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class RestService(
    private val httpService: HttpService,
    private val prefs: PreferenceManager
) {

    suspend fun getLatestRelease(repo: String) = withContext(Dispatchers.IO) {
        httpService.request<Release> {
            url("https://api.github.com/repos/$repo/releases/latest")
        }
    }

    /** The newest releases of [repo]; the repository also hosts the classic client, so callers filter by tag. */
    suspend fun getReleases(repo: String) = withContext(Dispatchers.IO) {
        httpService.request<List<Release>> {
            url("https://api.github.com/repos/$repo/releases")
            parameter("per_page", 20)
        }
    }

    suspend fun getLatestDiscordVersions() = withContext(Dispatchers.IO) {
        httpService.request<Index> {
            url("${BuildConfig.DEV_MIRROR_URL.ifEmpty { prefs.mirror.baseUrl }}/tracker/index")
        }
    }

    /**
     * The published build: `data.json` next to the loader this installer downloads, so a test installer reads its own
     * builds branch. The query parameter defeats GitHub's cache.
     */
    suspend fun getBuildInfo() = withContext(Dispatchers.IO) {
        httpService.request<BuildInfo> {
            url("${BuildConfig.LOADER_URL.substringBeforeLast('/')}/data.json")
            parameter("t", System.currentTimeMillis() / 60_000)
        }
    }

    /** Commits of the `next` branch; the repository's default branch is the classic-app client. */
    suspend fun getCommits(repo: String, page: Int = 1) = withContext(Dispatchers.IO) {
        httpService.request<List<Commit>> {
            url("https://api.github.com/repos/$repo/commits")
            parameter("sha", "next")
            parameter("page", page)
        }
    }

}