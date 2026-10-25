package com.endcord.installer.network.services

import com.endcord.installer.BuildConfig
import com.endcord.installer.di.cacheControl
import com.endcord.installer.network.utils.*
import io.ktor.client.request.header
import io.ktor.client.request.url
import io.ktor.http.*

class AliucordMavenService(private val http: HttpService) {
    suspend fun getAliuhookVersion(force: Boolean = false): ApiResponse<SemVer> {
        val metadataResponse = http.request<String> {
            url("${BuildConfig.MAVEN_URL}/com/aliucord/Aliuhook/maven-metadata.xml")

            if (!force) {
                cacheControl(CacheControl.MaxAge(maxAgeSeconds = 60 * 30)) // 30 min
            } else {
                header(HttpHeaders.CacheControl, "no-cache")
            }
        }

        return metadataResponse.transform {
            val versionString = "<release>(.+?)</release>".toRegex()
                .find(it)
                ?.groupValues?.get(1)
                ?: return ApiResponse.Error(ApiError(HttpStatusCode.OK, "No version in the aliuhook artifact metadata"))

            SemVer.parseOrNull(versionString)
                ?: return ApiResponse.Error(ApiError(HttpStatusCode.OK, "Invalid latest aliuhook version!"))
        }
    }

    fun getAliuhookUrl(version: SemVer): String =
        "${BuildConfig.MAVEN_URL}/com/aliucord/Aliuhook/$version/Aliuhook-$version.aar"
}
