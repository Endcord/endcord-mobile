package com.endcord.installer.ui.previews.dialogs

import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.endcord.installer.ui.screens.plugins.components.dialogs.UninstallPluginDialog
import com.endcord.installer.ui.theme.ManagerTheme

@Composable
@Preview(uiMode = Configuration.UI_MODE_NIGHT_YES)
@Preview(uiMode = Configuration.UI_MODE_NIGHT_NO)
private fun UninstallPluginDialogPreview() {
    ManagerTheme {
        UninstallPluginDialog(
            pluginName = "FakeNitro",
            onConfirm = {},
            onDismiss = {},
        )
    }
}
