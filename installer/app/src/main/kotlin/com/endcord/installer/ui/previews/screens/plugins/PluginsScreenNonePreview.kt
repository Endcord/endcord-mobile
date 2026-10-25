package com.endcord.installer.ui.previews.screens.plugins

import android.content.res.Configuration
import androidx.compose.runtime.*
import androidx.compose.ui.tooling.preview.Preview
import com.endcord.installer.ui.screens.plugins.PluginsScreenContent
import com.endcord.installer.ui.theme.ManagerTheme
import com.endcord.installer.ui.util.emptyImmutableList

// This preview has interactable content that cannot be tested from an IDE preview

@Composable
@Preview(uiMode = Configuration.UI_MODE_NIGHT_YES)
@Preview(uiMode = Configuration.UI_MODE_NIGHT_NO)
private fun PluginsScreenNonePreview() {
    val filterState = remember { mutableStateOf("") }

    ManagerTheme {
        PluginsScreenContent(
            searchText = filterState,
            setSearchText = filterState::value::set,
            isError = false,
            plugins = emptyImmutableList(),
            onPluginUninstall = {},
            onPluginChangelog = {},
            onPluginToggle = { name, enabled -> },
            safeMode = false,
            setSafeMode = {}
        )
    }
}
