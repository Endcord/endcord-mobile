package app.revenge.manager.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * `data.json` on the `builds` branch, written by the Build workflow: which bundle and loader are published
 * and which commit they were built from.
 */
@Serializable
data class BuildInfo(
    val bundle: String,
    val loader: String,
    @SerialName("loaderVersion") val loaderVersion: String,
    @SerialName("loaderVersionCode") val loaderVersionCode: Int,
    val commit: String,
    @SerialName("builtAt") val builtAt: String = "",
)
