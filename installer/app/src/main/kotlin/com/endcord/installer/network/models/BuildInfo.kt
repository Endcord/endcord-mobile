/*
 * Copyright (c) 2022 Juby210 & zt
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.installer.network.models

import com.endcord.installer.network.utils.SemVer
import com.endcord.installer.util.serialization.IntAsStringSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Remote Endcord build data, published to the `builds` branch of the Endcord mobile repository.
 * This is used to determine the latest available versions of components.
 */
@Serializable
data class BuildInfo(
    @Serializable(with = IntAsStringSerializer::class)
    @SerialName("versionCode")
    val discordVersionCode: Int,
    // @SerialName("versionName")
    // val discordVersionName: Int,
    // @SerialName("coreVersion")
    // val coreVersion: SemVer,
    @SerialName("injectorVersion")
    val injectorVersion: SemVer,
    @SerialName("patchesVersion")
    val patchesVersion: SemVer,
    @SerialName("kotlinVersion")
    val kotlinVersion: SemVer,
)
