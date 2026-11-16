package app.revenge.manager.ui.screen.installer

import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.Article
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.revenge.manager.R
import app.revenge.manager.domain.manager.PreferenceManager
import app.revenge.manager.installer.step.StepStatus
import app.revenge.manager.ui.viewmodel.installer.InstallerViewModel
import app.revenge.manager.ui.widgets.dialog.BackWarningDialog
import app.revenge.manager.ui.widgets.dialog.DownloadFailedDialog
import app.revenge.manager.ui.widgets.installer.StepGroupCard
import app.revenge.manager.utils.DiscordVersion
import cafe.adriel.voyager.core.screen.Screen
import cafe.adriel.voyager.core.screen.ScreenKey
import cafe.adriel.voyager.koin.getScreenModel
import cafe.adriel.voyager.navigator.LocalNavigator
import cafe.adriel.voyager.navigator.currentOrThrow
import okhttp3.internal.toImmutableList
import org.koin.androidx.compose.get
import org.koin.core.parameter.parametersOf
import java.util.UUID
import app.revenge.manager.ui.components.readableWidth

class InstallerScreen(
    val version: DiscordVersion,
    /** Build from the Discord installed on the phone instead of downloading it */
    val useInstalled: Boolean = false
) : Screen {

    override val key: ScreenKey = "Installer-${UUID.randomUUID()}"

    @Composable
    override fun Content() {
        val nav = LocalNavigator.currentOrThrow
        val activity = LocalContext.current as? ComponentActivity
        val viewModel: InstallerViewModel = getScreenModel {
            parametersOf(version, useInstalled)
        }

        LaunchedEffect(viewModel.runner.currentStep) {
            viewModel.expandGroup(viewModel.runner.currentStep?.group)
        }

        BackHandler(
            enabled = !viewModel.runner.completed
        ) {
            viewModel.openBackDialog()
        }

        if(viewModel.backDialogOpened) {
            BackWarningDialog(
                onExitClick = {
                    viewModel.closeBackDialog()
                    viewModel.cancelInstall()
                    nav.pop()
                },
                onClose = { viewModel.closeBackDialog() }
            )
        }

        if(viewModel.runner.downloadErrored) {
            DownloadFailedDialog(
                onTryAgainClick = {
                    viewModel.dismissDownloadFailedDialog()
                    viewModel.cancelInstall()
                    nav.replace(InstallerScreen(version, useInstalled))
                },
                onDismiss = {
                    viewModel.dismissDownloadFailedDialog()
                }
            )
        }

        val steps = viewModel.runner.steps
        val finished = steps.count { it.status == StepStatus.SUCCESSFUL }
        val failed = steps.any { it.status == StepStatus.UNSUCCESSFUL }
        val succeeded = viewModel.runner.completed && !failed && finished == steps.size

        Scaffold(
            topBar = {
                TitleBar(
                    viewModel = viewModel,
                    onBackClick = {
                        if(!viewModel.runner.completed)
                            viewModel.openBackDialog()
                        else
                            nav.pop()
                    }
                )
            }
        ) {
            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .padding(it)
                    .verticalScroll(rememberScrollState())
                    .readableWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                StatusCard(
                    viewModel = viewModel,
                    finished = finished,
                    total = steps.size,
                    failed = failed,
                    succeeded = succeeded,
                )

                Spacer(modifier = Modifier.height(4.dp))

                for ((group, groupSteps) in viewModel.groupedSteps) {
                    key(group) {
                        StepGroupCard(
                            name = stringResource(group.nameRes),
                            isCurrent = viewModel.expandedGroup == group,
                            onClick = { viewModel.expandGroup(group) },
                            steps = groupSteps,
                        )
                    }
                }

                if (viewModel.runner.completed) {
                    Spacer(modifier = Modifier.height(8.dp))

                    when {
                        succeeded -> WideButton(
                            icon = Icons.Filled.OpenInNew,
                            text = stringResource(R.string.action_launch),
                            onClick = { viewModel.launchMod() }
                        )

                        failed -> WideButton(
                            icon = Icons.Filled.Refresh,
                            text = stringResource(R.string.action_retry),
                            onClick = { nav.replace(InstallerScreen(version, useInstalled)) }
                        )
                    }

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                    ) {
                        FilledTonalButton(
                            onClick = { activity?.let(viewModel::shareLogs) },
                            modifier = Modifier
                                .weight(1f)
                                .height(48.dp)
                        ) {
                            Text(stringResource(R.string.action_share_logs))
                        }

                        FilledTonalButton(
                            onClick = { viewModel.clearCache() },
                            modifier = Modifier
                                .weight(1f)
                                .height(48.dp)
                        ) {
                            Text(stringResource(R.string.action_clear_cache))
                        }
                    }
                }
            }
        }
    }

    /**
     * How the install goes, on a card tinted by it: the step running and how many are done, or what to do after it
     * finished or failed
     */
    @Composable
    private fun StatusCard(
        viewModel: InstallerViewModel,
        finished: Int,
        total: Int,
        failed: Boolean,
        succeeded: Boolean,
    ) {
        val colors = MaterialTheme.colorScheme
        val (container, content) = when {
            failed -> colors.errorContainer to colors.onErrorContainer
            succeeded -> colors.tertiaryContainer to colors.onTertiaryContainer
            else -> colors.primaryContainer to colors.onPrimaryContainer
        }
        val progress by animateFloatAsState(finished.toFloat() / total.coerceAtLeast(1), label = "Install progress")

        val title = stringResource(
            when {
                failed -> R.string.installer_status_failed
                succeeded -> R.string.installer_success
                else -> R.string.installer_status_running
            }
        )
        val subtitle = when {
            failed -> stringResource(R.string.installer_failed_hint)
            succeeded -> stringResource(R.string.installer_done_hint)
            else -> {
                val step = viewModel.runner.currentStep?.let { stringResource(it.nameRes) }
                val count = stringResource(R.string.installer_steps_progress, finished, total)
                if (step != null) "$step · $count" else count
            }
        }

        Column(
            verticalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier
                .fillMaxWidth()
                .clip(MaterialTheme.shapes.large)
                .background(container)
                .padding(20.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                when {
                    failed -> Icon(Icons.Rounded.ErrorOutline, contentDescription = null, tint = content, modifier = Modifier.size(32.dp))
                    succeeded -> Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = content, modifier = Modifier.size(32.dp))
                    else -> CircularProgressIndicator(color = content, strokeWidth = 3.dp, modifier = Modifier.size(28.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(text = title, style = MaterialTheme.typography.titleLarge, color = content)
                    Text(text = subtitle, style = MaterialTheme.typography.bodyMedium, color = content.copy(alpha = 0.8f))
                }
            }

            if (!failed && !succeeded) {
                LinearProgressIndicator(
                    progress = { progress },
                    color = content,
                    trackColor = content.copy(alpha = 0.2f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(CircleShape)
                )
            }
        }
    }

    @Composable
    private fun WideButton(icon: ImageVector, text: String, onClick: () -> Unit) {
        Button(
            onClick = onClick,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
        ) {
            Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(10.dp))
            Text(text = text, style = MaterialTheme.typography.titleMedium)
        }
    }

    @Composable
    @OptIn(ExperimentalMaterial3Api::class)
    private fun TitleBar(
        onBackClick: () -> Unit,
        viewModel: InstallerViewModel
    ) {
        val prefs: PreferenceManager = get()
        val nav = LocalNavigator.currentOrThrow

        TopAppBar(
            title = { Text(stringResource(R.string.title_installer)) },
            navigationIcon = {
                IconButton(onClick = onBackClick) {
                    Icon(
                        imageVector = Icons.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.action_back)
                    )
                }
            },
            actions = {
                if (prefs.isDeveloper && viewModel.runner.completed) {
                    IconButton(onClick = { nav.push(LogViewerScreen(viewModel.runner.logger.logs.toImmutableList())) }) {
                        Icon(
                            imageVector = Icons.Outlined.Article,
                            contentDescription = stringResource(R.string.action_view_logs)
                        )
                    }
                }
            }
        )
    }

}
