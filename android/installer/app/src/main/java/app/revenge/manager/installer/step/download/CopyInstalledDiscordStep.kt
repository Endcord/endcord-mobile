// Copyright (c) 2026 rootpoi and contributors
package app.revenge.manager.installer.step.download

import android.content.Context
import androidx.compose.runtime.Stable
import app.revenge.manager.R
import app.revenge.manager.installer.step.Step
import app.revenge.manager.installer.step.StepGroup
import app.revenge.manager.installer.step.StepRunner
import app.revenge.manager.installer.util.ApkSignature
import app.revenge.manager.installer.util.DiscordApkManifest
import app.revenge.manager.utils.InstalledDiscord
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.koin.core.component.inject
import java.io.File

/**
 * Copies the APKs of the Discord already installed on the phone (usually from the Play Store), so Endcord is built
 * from exactly the version the user has instead of a download.
 *
 * @param workingDir Where the copies are patched
 */
@Stable
class CopyInstalledDiscordStep(
    private val workingDir: File
) : Step() {

    private val context: Context by inject()

    override val group = StepGroup.DL
    override val nameRes = R.string.step_copy_installed

    /** The base APK, then every split, as copied */
    lateinit var apks: List<File>
        private set

    val baseApk: File get() = apks.first()

    override suspend fun run(runner: StepRunner) = withContext(Dispatchers.IO) {
        // Only Discord's own: any app can be installed as com.discord where Discord isn't
        val info = InstalledDiscord.packageInfo(context)?.applicationInfo
            ?: throw IllegalStateException("Discord isn't installed anymore. Go back and choose to download it instead.")

        workingDir.mkdirs()
        val sources = listOf(File(info.sourceDir)) + (info.splitSourceDirs?.map(::File) ?: emptyList())
        val total = sources.sumOf { it.length() }.coerceAtLeast(1)
        var copied = 0L

        apks = sources.mapIndexed { i, source ->
            // Splits keep their names (split_config.arm64_v8a.apk...), which say what they contain
            val target = workingDir.resolve(if (i == 0) "base.apk" else source.name)
            runner.logger.i("Copying ${source.name} (${source.length() / 1024} KiB)")
            source.inputStream().use { input ->
                target.outputStream().use { output ->
                    val buffer = ByteArray(1 shl 16)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        copied += read
                        progress = copied.toFloat() / total
                    }
                }
            }
            target
        }

        // The copies are checked, not the installed files: they are what's patched, and nothing outside this app can
        // swap them between the check and the patching. Each must carry Discord's signature, and all be one Discord.
        runner.logger.i("Verifying the copies")
        apks.forEach { ApkSignature.requireDiscord(it) }
        val versionCode = DiscordApkManifest.requireOneDiscord(apks)
        runner.logger.i("Copied ${apks.size} APKs of Discord ${InstalledDiscord.versionName(context)} ($versionCode)")
    }
}
