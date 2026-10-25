package com.aliucord.injector

import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

private const val BUILDS_URL = "https://raw.githubusercontent.com/${BuildConfig.GITHUB_REPO}/builds"
private const val DATA_URL = "$BUILDS_URL/data.json"
private const val CORE_URL = "$BUILDS_URL/Endcord.zip"
private const val USER_AGENT = "Endcord Injector/${BuildConfig.VERSION} (https://github.com/${BuildConfig.GITHUB_REPO})"

/**
 * Downloads the latest Endcord core to [outputFile].
 */
internal fun downloadLatestCore(outputFile: File) {
    val tmpFile = outputFile.resolveSibling(outputFile.name + ".tmp")

    Logger.d("Downloading latest Endcord core from $CORE_URL...")
    val startTime = System.currentTimeMillis()

    val conn = URL(CORE_URL).openConnection() as HttpURLConnection
    conn.setRequestProperty("User-Agent", USER_AGENT)
    conn.useCaches = false
    conn.connectTimeout = 15_000
    conn.readTimeout = 30_000
    if (conn.responseCode != HttpURLConnection.HTTP_OK) {
        throw IllegalStateException("Core download failed with HTTP ${conn.responseCode}")
    }

    conn.getInputStream().use { stream ->
        tmpFile.outputStream().use { out ->
            val buffer = ByteArray(1024 * 64) // 64 KiB
            val length = conn.contentLengthLong

            var oldProgress = 0f
            var downloaded = 0
            var bytes = stream.read(buffer)
            while (bytes >= 0) {
                out.write(buffer, 0, bytes)

                val newProgress = (downloaded + bytes) / length.toFloat()
                if (newProgress >= oldProgress + 0.1f) {
                    oldProgress = newProgress
                    Logger.d("Downloaded %.2f%% after %sms".format(
                        Locale.ROOT,
                        newProgress * 100,
                        System.currentTimeMillis() - startTime,
                    ))
                }

                downloaded += bytes
                bytes = stream.read(buffer)
            }
        }
    }
    if (tmpFile.length() == 0L || !tmpFile.renameTo(outputFile)) {
        tmpFile.delete()
        throw IllegalStateException("Failed to save the downloaded core")
    }
    Logger.d("Downloaded Endcord core after ${System.currentTimeMillis() - startTime}ms")
}

/**
 * A parsed model of the data available at [DATA_URL].
 */
internal data class BuildData(
    var discordVersion: Int,
    var kotlinVersion: String,
) {
    val kotlinVersionParsed: KotlinVersion
        get() {
            return try {
                val parts = kotlinVersion
                    .split('.')
                    .map { it.toInt() }

                KotlinVersion(parts[0], parts[1], parts[2])
            } catch (_: Exception) {
                throw IllegalArgumentException("Invalid remote Kotlin version '$kotlinVersion'")
            }
        }
}

/**
 * Fetches and parses the remote build data that is used to determine if update is possible.
 */
internal fun fetchBuildData(): BuildData {
    Logger.d("Fetching remote build data...")

    // raw.githubusercontent.com caches responses for a few minutes, the query string keeps it fresh
    val conn = URL("$DATA_URL?t=${System.currentTimeMillis() / 60_000}").openConnection() as HttpURLConnection
    conn.setRequestProperty("User-Agent", USER_AGENT)
    conn.useCaches = false
    conn.connectTimeout = 15_000
    conn.readTimeout = 15_000

    val data = JSONObject(conn.inputStream.bufferedReader().readText())
    return BuildData(
        discordVersion = data.getInt("versionCode"),
        kotlinVersion = data.optString("kotlinVersion", "1.5.21"),
    )
}
