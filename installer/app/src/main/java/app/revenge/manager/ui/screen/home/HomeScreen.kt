package app.revenge.manager.ui.screen.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SegmentedButton as ChoiceButton
import androidx.compose.ui.semantics.Role
import app.revenge.manager.domain.manager.DiscordSource
import app.revenge.manager.domain.manager.Edition
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.paging.compose.collectAsLazyPagingItems
import app.revenge.manager.BuildConfig
import app.revenge.manager.R
import app.revenge.manager.domain.manager.PreferenceManager
import app.revenge.manager.ui.components.SegmentedButton
import app.revenge.manager.ui.screen.installer.InstallerScreen
import app.revenge.manager.ui.screen.settings.SettingsScreen
import app.revenge.manager.ui.viewmodel.home.HomeViewModel
import app.revenge.manager.ui.widgets.AppIcon
import app.revenge.manager.ui.widgets.dialog.BatteryOptimizationDialog
import app.revenge.manager.ui.widgets.home.CommitList
import app.revenge.manager.ui.widgets.updater.UpdateDialog
import app.revenge.manager.utils.Constants
import app.revenge.manager.utils.DiscordVersion
import app.revenge.manager.utils.navigate
import cafe.adriel.voyager.core.screen.Screen
import cafe.adriel.voyager.koin.getScreenModel
import cafe.adriel.voyager.navigator.LocalNavigator
import cafe.adriel.voyager.navigator.currentOrThrow
import org.koin.androidx.compose.get

private val COMPACT_HEIGHT = 720.dp
private val COMPACT_LIST_HEIGHT = 360.dp

class HomeScreen : Screen {

    @Composable
    override fun Content() {
        val navigator = LocalNavigator.currentOrThrow
        val prefs: PreferenceManager = get()
        val viewModel: HomeViewModel = getScreenModel()

        val currentVersion = remember {
            DiscordVersion.fromVersionCode(viewModel.installManager.current?.versionCode.toString())
        }

        val downloadVersion =
            remember(prefs.discordVersion, viewModel.discordVersions, prefs.channel) {
                when {
                    prefs.discordVersion.isBlank() -> viewModel.discordVersions?.get(prefs.channel)
                    else -> DiscordVersion.fromVersionCode(prefs.discordVersion)
                }
            }

        // Endcord is built from the Discord on the phone when there is one, unless the user picks a download
        var source by remember { mutableStateOf(prefs.discordSource) }
        val installedDiscord = viewModel.installedDiscord
        val useInstalled = installedDiscord != null && source == DiscordSource.INSTALLED
        val latestVersion = if (useInstalled) installedDiscord else downloadVersion

        // Endcord on the current Discord is installed here; Endcord Classic, on Aliucord's older Discord, by its own
        // installer, which this one fetches and opens
        var edition by remember { mutableStateOf(prefs.edition) }

        // Back from installing Endcord Classic Installer, the button opens it
        val lifecycleOwner = LocalLifecycleOwner.current
        DisposableEffect(lifecycleOwner) {
            val observer = LifecycleEventObserver { _, event ->
                if (event == Lifecycle.Event.ON_RESUME) viewModel.refreshClassic()
            }
            lifecycleOwner.lifecycle.addObserver(observer)
            onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
        }

        // == Dialogs == //

        BatteryOptimizationDialog()

        if (
            viewModel.showUpdateDialog &&
            viewModel.release != null &&
            !BuildConfig.DEBUG
        ) {
            var progress by remember { mutableStateOf<Float?>(null) }

            UpdateDialog(
                release = viewModel.release!!,
                isUpdating = viewModel.isUpdating,
                progress = progress,
                onDismiss = { viewModel.showUpdateDialog = false },
                onConfirm = {
                    viewModel.downloadAndInstallUpdate { newProgress -> progress = newProgress }
                }
            )
        }

        // == Screen == //

        Scaffold(
            topBar = { TitleBar() },
        ) { pv ->
            BoxWithConstraints(modifier = Modifier.padding(pv)) {
                // A short screen (a phone on its side, a tablet) can't fit the buttons and the change list: the page
                // scrolls and the list gets a fixed height. A tall one gives the list the room that's left. Larger text
                // needs a taller screen, or the buttons at the bottom would be cut off with no way to scroll to them.
                val compact = maxHeight < COMPACT_HEIGHT * LocalDensity.current.fontScale
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier
                        .then(if (compact) Modifier.verticalScroll(rememberScrollState()) else Modifier)
                        .padding(16.dp)
                        .fillMaxWidth()
                ) {
                    EditionPicker(
                        edition = edition,
                        onChange = {
                            edition = it
                            prefs.edition = it
                        }
                    )

                    if (edition == Edition.CLASSIC) {
                        ClassicPanel(viewModel)
                    } else {
                        AppIcon(
                            customIcon = prefs.patchIcon,
                            releaseChannel = prefs.channel,
                            modifier = Modifier.size(60.dp)
                        )

                        Text(
                            text = prefs.appName,
                            style = MaterialTheme.typography.titleLarge
                        )

                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            AnimatedVisibility(visible = currentVersion != null) {
                                Text(
                                    text = stringResource(
                                        R.string.version_current,
                                        currentVersion.toString()
                                    ),
                                    style = MaterialTheme.typography.labelLarge,
                                    color = LocalContentColor.current.copy(alpha = 0.5f),
                                    textAlign = TextAlign.Center
                                )
                            }

                            val latestLabel = when {
                                useInstalled -> R.string.version_on_phone
                                prefs.discordVersion.isNotBlank() -> R.string.version_target
                                else -> R.string.version_latest
                            }

                            AnimatedVisibility(visible = latestVersion != null) {
                                Text(
                                    text = stringResource(latestLabel, latestVersion.toString()),
                                    style = MaterialTheme.typography.labelLarge,
                                    color = LocalContentColor.current.copy(alpha = 0.5f),
                                    textAlign = TextAlign.Center
                                )
                            }
                        }

                        if (installedDiscord != null) {
                            SourcePicker(
                                source = source,
                                installed = installedDiscord,
                                download = downloadVersion,
                                onChange = {
                                    source = it
                                    prefs.discordSource = it
                                }
                            )
                        }

                        Button(
                            onClick = {
                                navigator.navigate(InstallerScreen(latestVersion!!, useInstalled))
                            },
                            enabled = latestVersion != null && (prefs.allowDowngrade || latestVersion >= (currentVersion ?: Constants.DUMMY_VERSION)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            val label = when {
                                latestVersion == null -> R.string.msg_loading
                                currentVersion == null -> R.string.action_install
                                currentVersion == latestVersion -> R.string.action_reinstall
                                latestVersion > currentVersion -> R.string.action_update
                                else -> if (prefs.allowDowngrade) R.string.msg_downgrade else R.string.msg_downgrade_disallowed
                            }

                            Text(
                                text = stringResource(label),
                                textAlign = TextAlign.Center,
                                maxLines = 1,
                                modifier = Modifier
                                    .basicMarquee()
                                    .fillMaxWidth()
                            )
                        }

                        AnimatedVisibility(visible = viewModel.installManager.current != null) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(2.dp),
                                modifier = Modifier.clip(RoundedCornerShape(16.dp))
                            ) {
                                SegmentedButton(
                                    icon = Icons.Filled.OpenInNew,
                                    text = stringResource(R.string.action_launch),
                                    onClick = { viewModel.launchMod() }
                                )
                                SegmentedButton(
                                    icon = Icons.Filled.Info,
                                    text = stringResource(R.string.action_info),
                                    onClick = { viewModel.launchModInfo() }
                                )
                                SegmentedButton(
                                    icon = Icons.Filled.Delete,
                                    text = stringResource(R.string.action_uninstall),
                                    onClick = { viewModel.uninstallMod() }
                                )
                            }
                        }

                        ElevatedCard(
                            modifier = if (compact) Modifier.fillMaxWidth().height(COMPACT_LIST_HEIGHT) else Modifier.fillMaxSize()
                        ) {
                            CommitList(
                                commits = viewModel.commits.collectAsLazyPagingItems()
                            )
                        }
                    }
                }
            }
        }
    }

    /** One row of two buttons and a line on the chosen one, so the install button below stays in view on a small phone */
    @Composable
    @OptIn(ExperimentalMaterial3Api::class)
    private fun EditionPicker(edition: Edition, onChange: (Edition) -> Unit) {
        val editions = listOf(
            Edition.ENDCORD to R.string.edition_endcord,
            Edition.CLASSIC to R.string.edition_classic,
        )
        val title = stringResource(R.string.edition_title)

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            SingleChoiceSegmentedButtonRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = title }
            ) {
                editions.forEachIndexed { index, (value, label) ->
                    ChoiceButton(
                        selected = edition == value,
                        onClick = { onChange(value) },
                        shape = SegmentedButtonDefaults.itemShape(index, editions.size),
                        // The fill shows the choice; a checkmark would cut "Endcord Classic" short on a narrow phone
                        icon = {},
                        label = { Text(stringResource(label), maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    )
                }
            }
            Text(
                text = stringResource(if (edition == Edition.CLASSIC) R.string.edition_classic_desc else R.string.edition_endcord_desc),
                style = MaterialTheme.typography.bodySmall,
                color = LocalContentColor.current.copy(alpha = 0.6f),
                textAlign = TextAlign.Center
            )
        }
    }

    @Composable
    private fun ClassicPanel(viewModel: HomeViewModel) {
        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.padding(16.dp)
            ) {
                Text(
                    text = stringResource(R.string.edition_classic),
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    text = stringResource(R.string.classic_body),
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    text = stringResource(R.string.classic_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = LocalContentColor.current.copy(alpha = 0.6f)
                )
                if (viewModel.isGettingClassic) {
                    val progress = viewModel.classicProgress
                    if (progress != null) {
                        LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
                    } else {
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    }
                }
                Button(
                    onClick = { viewModel.openOrGetClassicInstaller() },
                    enabled = !viewModel.isGettingClassic,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = stringResource(
                            if (viewModel.classicInstallerInstalled) R.string.action_open_classic_installer
                            else R.string.action_get_classic_installer
                        ),
                        textAlign = TextAlign.Center,
                        maxLines = 1,
                        modifier = Modifier
                            .basicMarquee()
                            .fillMaxWidth()
                    )
                }
            }
        }
    }

    @Composable
    private fun SourcePicker(
        source: DiscordSource,
        installed: DiscordVersion,
        download: DiscordVersion?,
        onChange: (DiscordSource) -> Unit
    ) {
        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(vertical = 8.dp)) {
                SourceOption(
                    selected = source == DiscordSource.INSTALLED,
                    title = stringResource(R.string.source_installed),
                    subtitle = stringResource(R.string.source_installed_desc, installed.toString()),
                    onClick = { onChange(DiscordSource.INSTALLED) }
                )
                SourceOption(
                    selected = source == DiscordSource.DOWNLOAD,
                    title = stringResource(R.string.source_download),
                    subtitle = download?.let { stringResource(R.string.source_download_desc, it.toString()) }
                        ?: stringResource(R.string.msg_loading),
                    onClick = { onChange(DiscordSource.DOWNLOAD) }
                )
            }
        }
    }

    @Composable
    private fun SourceOption(selected: Boolean, title: String, subtitle: String, onClick: () -> Unit) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            RadioButton(selected = selected, onClick = null)
            Column(modifier = Modifier.padding(start = 12.dp)) {
                Text(text = title, style = MaterialTheme.typography.titleSmall)
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = LocalContentColor.current.copy(alpha = 0.6f)
                )
            }
        }
    }

    @Composable
    @OptIn(ExperimentalMaterial3Api::class)
    private fun TitleBar() {
        TopAppBar(
            title = { Text(stringResource(R.string.app_name)) },
            actions = { Actions() }
        )
    }

    @Composable
    private fun Actions() {
        val viewModel: HomeViewModel = getScreenModel()
        val navigator = LocalNavigator.currentOrThrow

        IconButton(onClick = {
            viewModel.getDiscordVersions()
            viewModel.refreshClassic()
        }) {
            Icon(
                imageVector = Icons.Filled.Refresh,
                contentDescription = stringResource(R.string.action_reload)
            )
        }
        IconButton(onClick = { navigator.navigate(SettingsScreen()) }) {
            Icon(
                imageVector = Icons.Outlined.Settings,
                contentDescription = stringResource(R.string.action_open_about)
            )
        }
    }

}