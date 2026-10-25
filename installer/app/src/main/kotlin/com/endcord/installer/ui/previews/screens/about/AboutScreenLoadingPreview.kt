package com.endcord.installer.ui.previews.screens.about

import android.content.res.Configuration
import androidx.compose.runtime.*
import androidx.compose.ui.tooling.preview.Preview
import com.endcord.installer.ui.screens.about.AboutScreenContent
import com.endcord.installer.ui.screens.about.AboutScreenState
import com.endcord.installer.ui.theme.ManagerTheme

// This preview cannot be properly viewed from an IDE

@Composable
@Preview(uiMode = Configuration.UI_MODE_NIGHT_YES)
@Preview(uiMode = Configuration.UI_MODE_NIGHT_NO)
private fun AboutScreenFailedPreview() {
    ManagerTheme {
        AboutScreenContent(
            state = remember { mutableStateOf(AboutScreenState.Loading) },
        )
    }
}

