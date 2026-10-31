package app.revenge.manager.ui.theme

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/**
 * Endcord's palette, the same "ink" colors Endcord PC and the legacy Endcord Installer are drawn with:
 * a deep night blue base, cobalt for actions and an icy accent taken from the logo.
 */
object Ink {
    val Night = Color(0xFF10182A)
    val Panel = Color(0xFF162137)
    val PanelHi = Color(0xFF1D2B46)
    val Line = Color(0xFF253452)
    val Ice = Color(0xFF9CCBFF)
    val Cobalt = Color(0xFF3D74E0)
    val CobaltHi = Color(0xFF5288F0)
    val Paper = Color(0xFFF3F6FB)
    val Mist = Color(0xFF8D9BB5)
    val Dim = Color(0xFF5A6985)
    val Bamboo = Color(0xFF74D49A)
    val Ember = Color(0xFFF0776B)
    val Honey = Color(0xFFF2C14E)

    /** Daylight counterparts, for people who prefer the light theme. */
    val DayBase = Color(0xFFF3F6FB)
    val DayPanel = Color(0xFFE6ECF6)
    val DayPanelHi = Color(0xFFD9E2F1)
    val DayLine = Color(0xFFC3CFE3)
    val DayInk = Color(0xFF10182A)
    val DaySubtle = Color(0xFF4A5874)
    val DayCobalt = Color(0xFF2F62CC)
}

val EndcordDarkColors = darkColorScheme(
    primary = Ink.Cobalt,
    onPrimary = Ink.Paper,
    primaryContainer = Color(0xFF22355E),
    onPrimaryContainer = Ink.Ice,
    inversePrimary = Ink.DayCobalt,
    secondary = Ink.Ice,
    onSecondary = Ink.Night,
    secondaryContainer = Ink.PanelHi,
    onSecondaryContainer = Ink.Ice,
    tertiary = Ink.Bamboo,
    onTertiary = Ink.Night,
    tertiaryContainer = Color(0xFF1C3B2D),
    onTertiaryContainer = Ink.Bamboo,
    background = Ink.Night,
    onBackground = Ink.Paper,
    surface = Ink.Night,
    onSurface = Ink.Paper,
    surfaceVariant = Ink.PanelHi,
    onSurfaceVariant = Ink.Mist,
    surfaceTint = Ink.Cobalt,
    inverseSurface = Ink.Paper,
    inverseOnSurface = Ink.Night,
    error = Ink.Ember,
    onError = Ink.Night,
    errorContainer = Color(0xFF4A2226),
    onErrorContainer = Color(0xFFFFC9C3),
    outline = Ink.Line,
    outlineVariant = Ink.Line,
    scrim = Color(0xCC0A101C),
    surfaceBright = Ink.PanelHi,
    surfaceDim = Ink.Night,
    surfaceContainerLowest = Color(0xFF0C1322),
    surfaceContainerLow = Color(0xFF131C30),
    surfaceContainer = Ink.Panel,
    surfaceContainerHigh = Color(0xFF1A263E),
    surfaceContainerHighest = Ink.PanelHi,
)

val EndcordLightColors = lightColorScheme(
    primary = Ink.DayCobalt,
    onPrimary = Ink.Paper,
    primaryContainer = Color(0xFFD7E4FF),
    onPrimaryContainer = Color(0xFF0E2A63),
    inversePrimary = Ink.Ice,
    secondary = Color(0xFF3F5F8F),
    onSecondary = Ink.Paper,
    secondaryContainer = Ink.DayPanelHi,
    onSecondaryContainer = Ink.DayInk,
    tertiary = Color(0xFF2E8A57),
    onTertiary = Ink.Paper,
    tertiaryContainer = Color(0xFFCDEFD9),
    onTertiaryContainer = Color(0xFF0D3A22),
    background = Ink.DayBase,
    onBackground = Ink.DayInk,
    surface = Ink.DayBase,
    onSurface = Ink.DayInk,
    surfaceVariant = Ink.DayPanelHi,
    onSurfaceVariant = Ink.DaySubtle,
    surfaceTint = Ink.DayCobalt,
    inverseSurface = Ink.Night,
    inverseOnSurface = Ink.Paper,
    error = Color(0xFFC8443A),
    onError = Ink.Paper,
    errorContainer = Color(0xFFFFDAD5),
    onErrorContainer = Color(0xFF5C120C),
    outline = Ink.DayLine,
    outlineVariant = Ink.DayLine,
    scrim = Color(0x99000000),
    surfaceBright = Color.White,
    surfaceDim = Ink.DayPanelHi,
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFEDF2F9),
    surfaceContainer = Ink.DayPanel,
    surfaceContainerHigh = Color(0xFFDFE7F3),
    surfaceContainerHighest = Ink.DayPanelHi,
)
