package com.endcord.installer.ui.previews.screens

import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.endcord.installer.manager.InstallerSetting
import com.endcord.installer.ui.screens.permissions.PermissionsScreenContent
import com.endcord.installer.ui.theme.ManagerTheme

@Composable
@Preview(uiMode = Configuration.UI_MODE_NIGHT_YES)
@Preview(uiMode = Configuration.UI_MODE_NIGHT_NO)
fun PermissionsScreenPreview() {
    ManagerTheme {
        PermissionsScreenContent(
            installer = InstallerSetting.PackageInstaller,
            openInstallersDialog = {},
            storagePermsGranted = true,
            onGrantStoragePerms = {},
            unknownSourcesPermsGranted = true,
            onGrantUnknownSourcesPerms = {},
            notificationsPermsGranted = false,
            onGrantNotificationsPerms = {},
            batteryPermsGranted = false,
            onGrantBatteryPerms = {},
            canContinue = true,
            onContinue = {},
        )
    }
}
