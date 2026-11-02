package app.revenge.manager.installer.shizuku

import android.content.Context
import app.revenge.manager.R
import app.revenge.manager.domain.manager.InstallManager
import app.revenge.manager.installer.Installer
import app.revenge.manager.utils.showToast
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import rikka.shizuku.Shizuku
import java.io.File

class ShizukuInstaller(private val context: Context) : Installer, KoinComponent {

    val installManager: InstallManager by inject()

    override suspend fun installApks(silent: Boolean, vararg apks: File) {
        if (!ShizukuPermissions.waitShizukuPermissions()) {
            withContext(Dispatchers.Main) {
                context.showToast(R.string.msg_shizuku_denied, short = false)
            }

            throw Error("Failed to install due to missing Shizuku permissions")
        }

        val tempDir = File("/data/local/tmp")
        val movedApks = mutableListOf<File>()

        // Copy each split to tmp. The shell can't read the app's own cache, where the APKs are, so each one is sent
        // through the command's input rather than copied by path.
        apks.forEach {
            val target = File(tempDir, it.name)
            executeShellCommand("cat > '${target.absolutePath}'", input = it)
            movedApks.add(target)
        }

        val installCommand = "pm install ${movedApks.joinToString(" ") { "'${it.absolutePath}'" }}"
        executeShellCommand(installCommand)

        installManager.getInstalled()
        movedApks.forEach {
            executeShellCommand("rm -f '${it.absolutePath}'")
        }
    }

    private fun executeShellCommand(command: String, input: File? = null): String {
        @Suppress("DEPRECATION")
        val process = Shizuku.newProcess(arrayOf("sh", "-c", command), null, null)

        process.outputStream.use { stdin -> input?.inputStream()?.use { it.copyTo(stdin) } }

        val errorStr = process.errorStream.bufferedReader().use { it.readText().trim() }
        if(errorStr.isNotBlank()) throw RuntimeException("Failed to execute $command:\n\n$errorStr")

        return process.inputStream.bufferedReader().use { it.readText().trim() }
    }

}
