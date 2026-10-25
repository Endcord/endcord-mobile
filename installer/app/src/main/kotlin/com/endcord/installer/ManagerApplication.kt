package com.endcord.installer

import android.app.Application
import android.content.Context
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.annotation.DelicateCoilApi
import com.endcord.installer.di.*
import com.endcord.installer.installers.dhizuku.DhizukuInstaller
import com.endcord.installer.installers.intent.IntentInstaller
import com.endcord.installer.installers.pm.PMInstaller
import com.endcord.installer.installers.root.RootInstaller
import com.endcord.installer.installers.shizuku.ShizukuInstaller
import com.endcord.installer.manager.*
import com.endcord.installer.manager.download.AndroidDownloadManager
import com.endcord.installer.manager.download.KtorDownloadManager
import com.endcord.installer.network.services.*
import com.endcord.installer.ui.screens.about.AboutModel
import com.endcord.installer.ui.screens.componentopts.ComponentOptionsModel
import com.endcord.installer.ui.screens.home.HomeModel
import com.endcord.installer.ui.screens.iconopts.IconOptionsModel
import com.endcord.installer.ui.screens.log.LogScreenModel
import com.endcord.installer.ui.screens.logs.LogsListScreenModel
import com.endcord.installer.ui.screens.patching.PatchingScreenModel
import com.endcord.installer.ui.screens.patchopts.PatchOptionsModel
import com.endcord.installer.ui.screens.permissions.PermissionsModel
import com.endcord.installer.ui.screens.plugins.PluginsModel
import com.endcord.installer.ui.screens.settings.SettingsModel
import com.endcord.installer.ui.widgets.updater.UpdaterViewModel
import kotlinx.coroutines.Dispatchers
import org.koin.android.ext.koin.androidContext
import org.koin.core.context.startKoin
import org.koin.core.module.dsl.*
import org.koin.dsl.module

class ManagerApplication : Application() {
    override fun attachBaseContext(base: Context) {
        super.attachBaseContext(com.endcord.installer.util.AppLanguage.wrap(base))
    }

    override fun onCreate() {
        super.onCreate()

        startKoin {
            // Android activities & context
            androidContext(this@ManagerApplication)
            modules(module(createdAtStart = true) {
                singleOf(::ActivityProvider)
            })

            // HTTP
            modules(module {
                single { provideJson() }
                single { provideHttpClient() }
            })

            // Services
            modules(module {
                singleOf(::HttpService)
                singleOf(::EndcordGithubService)
                singleOf(::AliucordMavenService)
            })

            // UI Models
            modules(module {
                factoryOf(::HomeModel)
                factoryOf(::PluginsModel)
                factoryOf(::AboutModel)
                factoryOf(::PatchingScreenModel)
                factoryOf(::SettingsModel)
                factoryOf(::PatchOptionsModel)
                factoryOf(::IconOptionsModel)
                factoryOf(::ComponentOptionsModel)
                factoryOf(::LogScreenModel)
                factoryOf(::LogsListScreenModel)
                factoryOf(::PermissionsModel)
                viewModelOf(::UpdaterViewModel)
            })

            // Managers
            modules(module {
                single { providePreferences() }
                singleOf(::PathManager)
                singleOf(::InstallerManager)
                singleOf(::OverlayManager)
                singleOf(::InstallLogManager)

                singleOf(::ShizukuManager)
                singleOf(::DhizukuManager)

                singleOf(::AndroidDownloadManager)
                singleOf(::KtorDownloadManager)
            })

            // Installers
            modules(module {
                singleOf(::PMInstaller)
                singleOf(::RootInstaller)
                singleOf(::IntentInstaller)
                singleOf(::ShizukuInstaller)
                singleOf(::DhizukuInstaller)
            })
        }

        // Limit parallel fetching of images using Coil
        @OptIn(DelicateCoilApi::class)
        SingletonImageLoader.setUnsafe { context ->
            ImageLoader.Builder(context)
                .fetcherCoroutineContext(Dispatchers.IO.limitedParallelism(5))
                .build()
        }
    }
}
