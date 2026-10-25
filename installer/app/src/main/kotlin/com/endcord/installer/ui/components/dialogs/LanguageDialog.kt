/*
 * This file is part of Endcord Installer.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.installer.ui.components.dialogs

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.endcord.installer.R
import com.endcord.installer.util.AppLanguage

/**
 * Picks one of the five languages Endcord ships with, or the system language.
 *
 * @param welcome Shown on first launch: worded as a greeting and can't be dismissed without choosing.
 */
@Composable
fun LanguageDialog(
    currentCode: String,
    welcome: Boolean = false,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var selected by rememberSaveable { mutableStateOf(currentCode) }

    AlertDialog(
        onDismissRequest = { if (!welcome) onDismiss() },
        icon = {
            Icon(
                painter = painterResource(R.drawable.ic_language),
                contentDescription = null,
                modifier = Modifier.size(32.dp),
            )
        },
        title = { Text(stringResource(if (welcome) R.string.language_welcome_title else R.string.setting_language)) },
        text = {
            Column {
                if (welcome) {
                    Text(
                        text = stringResource(R.string.language_welcome_desc),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 12.dp),
                    )
                }

                for (option in AppLanguage.options) key(option.code) {
                    val interactionSource = remember(::MutableInteractionSource)

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(MaterialTheme.shapes.small)
                            .clickable(
                                indication = null,
                                interactionSource = interactionSource,
                                onClick = { selected = option.code },
                            )
                            .padding(horizontal = 6.dp, vertical = 6.dp),
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                text = option.nativeName.ifEmpty { stringResource(R.string.language_system) },
                                style = MaterialTheme.typography.titleSmall,
                            )
                            if (option.code.isNotEmpty()) {
                                Text(
                                    text = stringResource(option.region),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }

                        RadioButton(
                            selected = option.code == selected,
                            onClick = { selected = option.code },
                            interactionSource = interactionSource,
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onConfirm(selected)
                    onDismiss()
                },
            ) {
                Text(stringResource(if (welcome) R.string.action_continue else R.string.action_apply))
            }
        },
    )
}
