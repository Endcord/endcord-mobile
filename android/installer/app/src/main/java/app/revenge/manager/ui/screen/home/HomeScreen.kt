package app.revenge.manager.ui.screen.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.rounded.CloudDownload
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.Upgrade
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
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
import app.revenge.manager.domain.manager.DiscordSource
import app.revenge.manager.domain.manager.Edition
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
import androidx.compose.material3.SegmentedButton as ChoiceButton
import app.revenge.manager.ui.components.readableWidth

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
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                    modifier = Modifier
                        .then(if (compact) Modifier.verticalScroll(rememberScrollState()) else Modifier)
                        .readableWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
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
                        val latestLabel = when {
                            useInstalled -> R.string.version_on_phone
                            prefs.discordVersion.isNotBlank() -> R.string.version_target
                            else -> R.string.version_latest
                        }

                        Hero(
                            prefs = prefs,
                            current = currentVersion?.let { stringResource(R.string.version_current, it.toString()) },
                            latest = latestVersion?.let { stringResource(latestLabel, it.toString()) },
                        )

                        if (installedDiscord != null) {
                            SourcePicker(
                                source = source,
                                installed = installedDiscord,
                                download = downloadVersion,
                                downloadFailed = viewModel.versionsFailed,
                                onChange = {
                                    source = it
                                    prefs.discordSource = it
                                }
                            )
                        }

                        // The versions couldn't be fetched: the button tries again rather than waiting for good
                        val retry = latestVersion == null && !useInstalled && viewModel.versionsFailed
                        val (label, icon) = when {
                            retry -> R.string.action_try_again to Icons.Filled.Refresh
                            latestVersion == null -> R.string.msg_loading to null
                            currentVersion == null -> R.string.action_install to Icons.Rounded.Download
                            // The same Discord, with a newer Endcord loader published: only installing again brings it
                            currentVersion == latestVersion && viewModel.endcordUpdate -> R.string.action_update to Icons.Rounded.Upgrade
                            currentVersion == latestVersion -> R.string.action_reinstall to Icons.Filled.Refresh
                            latestVersion > currentVersion -> R.string.action_update to Icons.Rounded.Upgrade
                            else -> (if (prefs.allowDowngrade) R.string.msg_downgrade else R.string.msg_downgrade_disallowed) to null
                        }

                        Button(
                            onClick = {
                                if (retry) viewModel.getDiscordVersions()
                                else navigator.navigate(InstallerScreen(latestVersion!!, useInstalled))
                            },
                            enabled = retry || latestVersion != null && (prefs.allowDowngrade || latestVersion >= (currentVersion ?: Constants.DUMMY_VERSION)),
                            contentPadding = PaddingValues(horizontal = 24.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp)
                        ) {
                            if (icon != null) {
                                Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(10.dp))
                            }
                            Text(
                                text = stringResource(label),
                                style = MaterialTheme.typography.titleMedium,
                                textAlign = TextAlign.Center,
                                maxLines = 1,
                                modifier = Modifier
                                    .weight(1f, fill = false)
                                    .basicMarquee()
                            )
                        }

                        if (currentVersion == latestVersion && viewModel.endcordUpdate) {
                            Text(
                                text = stringResource(R.string.msg_endcord_update),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }

                        AnimatedVisibility(visible = viewModel.installManager.current != null) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.fillMaxWidth()
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

                        Column(
                            modifier = Modifier
                                .then(if (compact) Modifier.fillMaxWidth().height(COMPACT_LIST_HEIGHT) else Modifier.fillMaxSize())
                                .clip(MaterialTheme.shapes.large)
                                .background(MaterialTheme.colorScheme.surfaceContainerLow)
                        ) {
                            Text(
                                text = stringResource(R.string.home_recent_changes),
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 4.dp)
                            )
                            Box(modifier = Modifier.weight(1f)) {
                                CommitList(
                                    commits = viewModel.commits.collectAsLazyPagingItems()
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    /** The app's icon and name on a tinted card, with the versions installed and to be installed */
    @Composable
    private fun Hero(prefs: PreferenceManager, current: String?, latest: String?) {
        val colors = MaterialTheme.colorScheme
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier
                .fillMaxWidth()
                .clip(MaterialTheme.shapes.large)
                .background(Brush.linearGradient(listOf(colors.primaryContainer, colors.surfaceContainerHigh)))
                .padding(20.dp)
        ) {
            AppIcon(
                customIcon = prefs.patchIcon,
                releaseChannel = prefs.channel,
                modifier = Modifier.size(64.dp)
            )

            Column(
                verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = prefs.appName,
                    style = MaterialTheme.typography.headlineSmall,
                    color = colors.onPrimaryContainer,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                AnimatedVisibility(visible = current != null) {
                    VersionChip(current.orEmpty())
                }
                AnimatedVisibility(visible = latest != null) {
                    VersionChip(latest.orEmpty())
                }
            }
        }
    }

    @Composable
    private fun VersionChip(text: String) {
        Surface(
            shape = CircleShape,
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.7f),
        ) {
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
            )
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
        Card(
            shape = MaterialTheme.shapes.large,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.padding(20.dp)
            ) {
                Text(
                    text = stringResource(R.string.edition_classic),
                    style = MaterialTheme.typography.titleLarge
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
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
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
        downloadFailed: Boolean,
        onChange: (DiscordSource) -> Unit
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            SourceOption(
                selected = source == DiscordSource.INSTALLED,
                icon = Icons.Rounded.PhoneAndroid,
                title = stringResource(R.string.source_installed),
                subtitle = stringResource(R.string.source_installed_desc, installed.toString()),
                onClick = { onChange(DiscordSource.INSTALLED) }
            )
            SourceOption(
                selected = source == DiscordSource.DOWNLOAD,
                icon = Icons.Rounded.CloudDownload,
                title = stringResource(R.string.source_download),
                subtitle = download?.let { stringResource(R.string.source_download_desc, it.toString()) }
                    ?: stringResource(if (downloadFailed) R.string.source_download_failed else R.string.msg_loading),
                onClick = { onChange(DiscordSource.DOWNLOAD) }
            )
        }
    }

    /** A choice as a card: tinted and outlined when it's the chosen one */
    @Composable
    private fun SourceOption(
        selected: Boolean,
        icon: ImageVector,
        title: String,
        subtitle: String,
        onClick: () -> Unit
    ) {
        val colors = MaterialTheme.colorScheme
        val shape = MaterialTheme.shapes.medium
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(if (selected) colors.secondaryContainer else colors.surfaceContainerLow)
                .border(
                    width = if (selected) 1.5.dp else 1.dp,
                    color = if (selected) colors.primary else colors.outlineVariant.copy(alpha = 0.6f),
                    shape = shape
                )
                .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
                .padding(horizontal = 16.dp, vertical = 12.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (selected) colors.primary else colors.onSurfaceVariant
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 14.dp)
            ) {
                Text(text = title, style = MaterialTheme.typography.titleSmall)
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = LocalContentColor.current.copy(alpha = 0.65f)
                )
            }
            RadioButton(selected = selected, onClick = null)
        }
    }

    @Composable
    @OptIn(ExperimentalMaterial3Api::class)
    private fun TitleBar() {
        TopAppBar(
            title = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    // Endcord's panda on night blue, as on the launcher. The launcher icon itself is an adaptive icon,
                    // which Compose can't draw: its foreground picture is, on the icon's own color
                    Image(
                        painter = painterResource(R.drawable.ic_launcher_foreground),
                        contentDescription = null,
                        modifier = Modifier
                            .size(36.dp)
                            .clip(MaterialTheme.shapes.small)
                            .background(colorResource(R.color.ic_launcher_background))
                    )
                    Text(stringResource(R.string.app_name))
                }
            },
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
