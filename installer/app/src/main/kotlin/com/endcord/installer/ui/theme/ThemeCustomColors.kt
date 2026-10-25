package com.endcord.installer.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color

@Suppress("UnusedReceiverParameter")
val MaterialTheme.customColors: CustomColors
    @Composable
    inline get() = LocalCustomColors.current

val LocalCustomColors = staticCompositionLocalOf<CustomColors> {
    error("No LocalCustomColors provided!")
}

@Immutable
data class CustomColors(
    val warning: Color,
    val onWarning: Color,
    val warningContainer: Color,
    val onWarningContainer: Color,
)

val DarkCustomColors = CustomColors(
    warning = Ink.Honey,
    onWarning = Ink.Night,
    warningContainer = Color(0xFF3D3214),
    onWarningContainer = Color(0xFFFFE3A3),
)

val LightCustomColors = CustomColors(
    warning = Color(0xFFB8860B),
    onWarning = Color.White,
    warningContainer = Color(0xFFFFEFC7),
    onWarningContainer = Color(0xFF3A2A00),
)
