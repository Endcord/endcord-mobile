package com.endcord.installer.ui.previews.screens.logs

import android.content.res.Configuration
import androidx.compose.runtime.*
import androidx.compose.ui.tooling.preview.Preview
import com.endcord.installer.ui.screens.logs.LogsScreenContent
import com.endcord.installer.ui.theme.ManagerTheme

@Composable
@Preview(uiMode = Configuration.UI_MODE_NIGHT_YES)
@Preview(uiMode = Configuration.UI_MODE_NIGHT_NO)
private fun LogsListScreenNonePreview() {
    ManagerTheme {
        LogsScreenContent(
            logs = remember { mutableStateListOf() },
            onOpenLog = {},
            onDeleteLogs = {},
        )
    }
}
