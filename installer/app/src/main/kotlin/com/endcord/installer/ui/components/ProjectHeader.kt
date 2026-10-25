package com.endcord.installer.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.endcord.installer.BuildConfig
import com.endcord.installer.R
import com.endcord.installer.ui.theme.WordmarkFontFamily
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.res.imageResource

@Composable
fun ProjectHeader(modifier: Modifier = Modifier) {
    val uriHandler = LocalUriHandler.current

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = modifier,
    ) {
        Image(
            bitmap = ImageBitmap.imageResource(R.drawable.ic_endcord_logo),
            contentDescription = null,
            // Pixel art: keep the pixels sharp instead of smoothing them out
            filterQuality = FilterQuality.None,
            modifier = Modifier
                .padding(bottom = 4.dp)
                .size(96.dp),
        )

        Text(
            text = stringResource(R.string.endcord),
            style = MaterialTheme.typography.titleMedium.copy(
                fontFamily = WordmarkFontFamily,
                fontSize = 30.sp,
                letterSpacing = 1.sp,
            ),
        )

        Text(
            text = stringResource(R.string.app_description),
            style = MaterialTheme.typography.titleSmall.copy(
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = .6f)
            ),
            textAlign = TextAlign.Center,
        )

        Row(
            horizontalArrangement = Arrangement.Center,
        ) {
            TextButton(onClick = { uriHandler.openUri("https://github.com/${BuildConfig.GITHUB_REPO}") }) {
                Icon(
                    painter = painterResource(R.drawable.ic_account_github_white_24dp),
                    contentDescription = null,
                    modifier = Modifier.padding(end = ButtonDefaults.IconSpacing),
                )
                Text(text = stringResource(R.string.github))
            }

            TextButton(onClick = { uriHandler.openUri("https://discord.gg/${BuildConfig.SUPPORT_SERVER}") }) {
                Icon(
                    painter = painterResource(R.drawable.ic_discord),
                    contentDescription = stringResource(R.string.support_server),
                    modifier = Modifier
                        .padding(end = ButtonDefaults.IconSpacing)
                        .size(22.dp),
                )
                Text(text = stringResource(R.string.discord))
            }
        }
    }
}
