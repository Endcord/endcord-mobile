package com.endcord.installer.ui.components.settings

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.endcord.installer.ui.components.TextDivider

@Composable
fun SettingsHeader(
    text: String,
) {
    TextDivider(
        text = text,
        modifier = Modifier.padding(18.dp, 20.dp, 18.dp, 10.dp)
    )
}
