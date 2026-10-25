/*
 * Copyright (c) 2022 Juby210 & zt
 * Licensed under the Open Software License version 3.0
 */


package com.endcord.installer.ui.screens.home

import android.os.Parcelable
import androidx.compose.animation.*
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import cafe.adriel.voyager.core.screen.Screen
import cafe.adriel.voyager.koin.koinScreenModel
import cafe.adriel.voyager.navigator.LocalNavigator
import cafe.adriel.voyager.navigator.currentOrThrow
import androidx.compose.ui.platform.LocalContext
import com.endcord.installer.R
import com.endcord.installer.manager.PreferencesManager
import com.endcord.installer.ui.components.dialogs.LanguageDialog
import org.koin.compose.koinInject
import com.endcord.installer.ui.components.LoadFailure
import com.endcord.installer.ui.components.ProjectHeader
import com.endcord.installer.ui.screens.home.components.*
import com.endcord.installer.ui.screens.patchopts.PatchOptionsScreen
import com.endcord.installer.ui.screens.plugins.PluginsScreen
import com.endcord.installer.ui.util.paddings.PaddingValuesSides
import com.endcord.installer.ui.util.paddings.exclude
import com.endcord.installer.util.*
import kotlinx.parcelize.IgnoredOnParcel
import kotlinx.parcelize.Parcelize

@Parcelize
class HomeScreen : Screen, Parcelable {
    @IgnoredOnParcel
    override val key = "Home"

    @Composable
    override fun Content() {
        val navigator = LocalNavigator.currentOrThrow
        val scope = rememberCoroutineScope()
        val model = koinScreenModel<HomeModel>()
        val preferences = koinInject<PreferencesManager>()
        val context = LocalContext.current

        // First launch: greet the user and let them pick a language, like Endcord PC's installer does
        var showWelcome by remember { mutableStateOf(!preferences.languageChosen) }
        if (showWelcome) {
            LanguageDialog(
                currentCode = preferences.language,
                welcome = true,
                onDismiss = { showWelcome = false },
                onConfirm = { code ->
                    preferences.languageChosen = true
                    if (code != preferences.language) {
                        preferences.language = code
                        AppLanguage.restart(context)
                    }
                },
            )
        }

        // Refresh installations list when the screen changes or activity resumes
        LifecycleResumeEffect(Unit) {
            model.refresh(delay = true)

            onPauseOrDispose {}
        }

        Scaffold(
            topBar = { HomeAppBar() },
        ) { padding ->
            when (val state = model.installsState) {
                is InstallsState.Fetched -> HomeScreenLoadedContent(
                    state = state,
                    padding = padding,
                    onClickInstall = { navigator.pushOnce(PatchOptionsScreen()) },
                    onUpdate = {
                        scope.launchIO {
                            val screen = model.createPrefilledPatchOptsScreen(it)
                            mainThread { navigator.push(screen) }
                        }
                    },
                    onOpenApp = model::openApp,
                    onOpenAppInfo = model::openAppInfo,
                    onOpenPlugins = { navigator.push(PluginsScreen()) }, // TODO: install-specific plugins
                )

                InstallsState.Fetching -> HomeScreenLoadingContent(padding = padding)

                InstallsState.None -> HomeScreenNoneContent(
                    padding = padding,
                    onClickInstall = { navigator.pushOnce(PatchOptionsScreen()) },
                )

                InstallsState.Error -> HomeScreenFailureContent(padding = padding)
            }
        }
    }
}

@Composable
fun HomeScreenLoadingContent(padding: PaddingValues) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .padding(top = 16.dp, start = 16.dp, end = 16.dp)
    ) {
        ProjectHeader()

        AnimatedVisibility(
            visibleState = remember { MutableTransitionState(false) }.apply { targetState = true },
            enter = fadeIn(animationSpec = tween(durationMillis = 800)),
            exit = ExitTransition.None,
        ) {
            Box(
                contentAlignment = Alignment.Center,
                content = { CircularProgressIndicator() },
                modifier = Modifier
                    .fillMaxSize(),
            )
        }
    }
}

@Composable
fun HomeScreenLoadedContent(
    state: InstallsState.Fetched,
    padding: PaddingValues,
    onClickInstall: () -> Unit,
    onUpdate: (packageName: String) -> Unit,
    onOpenApp: (packageName: String) -> Unit,
    onOpenAppInfo: (packageName: String) -> Unit,
    onOpenPlugins: (packageName: String) -> Unit,
) {
    LazyColumn(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        contentPadding = padding
            .exclude(PaddingValuesSides.Horizontal + PaddingValuesSides.Top),
        modifier = Modifier
            .fillMaxSize()
            .padding(padding.exclude(PaddingValuesSides.Bottom))
            .padding(top = 16.dp, start = 16.dp, end = 16.dp),
    ) {
        item(key = "PROJECT_HEADER") {
            ProjectHeader()
        }

        item(key = "ADD_INSTALL_BUTTON") {
            InstallButton(
                secondaryInstall = true,
                onClick = onClickInstall,
                modifier = Modifier
                    .padding(vertical = 4.dp)
                    .height(50.dp)
                    .fillMaxWidth()
            )
        }

        items(state.data, key = { it.packageName }) { item ->
            InstalledItemCard(
                data = item,
                onUpdate = { onUpdate(item.packageName) },
                onOpenApp = { onOpenApp(item.packageName) },
                onOpenInfo = { onOpenAppInfo(item.packageName) },
                onOpenPlugins = { onOpenPlugins(item.packageName) },
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Composable
fun HomeScreenNoneContent(
    padding: PaddingValues,
    onClickInstall: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
            .padding(padding)
            .padding(16.dp)
            .fillMaxSize(),
    ) {
        ProjectHeader()

        InstallButton(
            secondaryInstall = false,
            onClick = onClickInstall,
            modifier = Modifier
                .padding(12.dp)
                .height(height = 50.dp)
                .fillMaxWidth()
        )

        Column(
            verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .alpha(.7f)
                .fillMaxSize()
                .padding(bottom = 80.dp)
        ) {
            Text(
                text = """ /ᐠﹷ ‸ ﹷ ᐟ\ﾉ""",
                style = MaterialTheme.typography.labelLarge
                    .copy(fontSize = 38.sp),
            )

            Text(
                text = stringResource(R.string.installs_no_installs),
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.padding(start = 10.dp),
            )
        }
    }
}

@Composable
fun HomeScreenFailureContent(
    padding: PaddingValues,
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .padding(padding)
            .padding(16.dp)
            .fillMaxSize(),
    ) {
        ProjectHeader()
        LoadFailure(modifier = Modifier.fillMaxSize())
    }
}
