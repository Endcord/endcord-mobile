package app.revenge.manager.ui.widgets.installer

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.revenge.manager.R
import app.revenge.manager.installer.step.Step
import app.revenge.manager.installer.step.StepStatus
import app.revenge.manager.installer.step.download.base.DownloadStep

/**
 * Collapsable card containing a group of steps
 *
 * @param name The name of this group
 * @param isCurrent Whether this card is expanded
 * @param steps The steps belonging to this group
 * @param onClick Action taken when the header of the group is clicked
 */
@Composable
fun StepGroupCard(
    name: String,
    isCurrent: Boolean,
    steps: List<Step>,
    onClick: () -> Unit
) {
    val status = when {
        steps.all { it.status == StepStatus.QUEUED } -> StepStatus.QUEUED
        steps.all { it.status == StepStatus.SUCCESSFUL } -> StepStatus.SUCCESSFUL
        steps.any { it.status == StepStatus.ONGOING } -> StepStatus.ONGOING
        steps.any { it.status == StepStatus.UNSUCCESSFUL } -> StepStatus.UNSUCCESSFUL
        else -> StepStatus.ONGOING
    }
    val colors = MaterialTheme.colorScheme

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .background(if (isCurrent) colors.surfaceContainer else colors.surfaceContainerLow)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier
                .clickable(onClick = onClick)
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp)
        ) {
            StepIcon(status, 24.dp, progress = null)

            Text(text = name, style = MaterialTheme.typography.titleSmall)

            Spacer(modifier = Modifier.weight(1f))

            if (status != StepStatus.ONGOING && status != StepStatus.QUEUED) {
                Text(
                    text = "%.2fs".format(steps.sumOf { it.durationMs } / 1000f), // Displays the duration rounded to the hundredths place. ex. 10.13s
                    style = MaterialTheme.typography.labelMedium,
                    color = colors.onSurfaceVariant
                )
            }

            val (arrow, cd) = when {
                isCurrent -> Icons.Filled.KeyboardArrowUp to R.string.action_collapse
                else -> Icons.Filled.KeyboardArrowDown to R.string.action_expand
            }

            Icon(
                imageVector = arrow,
                contentDescription = stringResource(cd),
                tint = colors.onSurfaceVariant
            )
        }

        AnimatedVisibility(visible = isCurrent) {
            Column(
                verticalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 20.dp, end = 16.dp, top = 2.dp, bottom = 16.dp)
            ) {
                steps.forEach { step ->
                    StepRow(
                        name = stringResource(step.nameRes),
                        status = step.status,
                        progress = step.progress,
                        cached = (step as? DownloadStep)?.cached ?: false,
                        duration = step.durationMs / 1000f
                    )
                }
            }
        }
    }
}
