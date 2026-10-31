package app.revenge.manager.installer.util

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.lsposed.patch.ApkPatcher
import org.lsposed.patch.KeystoreSpec
import org.lsposed.patch.PatchSpec
import org.lsposed.patch.util.Logger
import java.io.File

object Patcher {

    suspend fun patch(
        logger: Logger,
        outputDir: File,
        apkPaths: List<String>,
        embeddedModules: List<String>
    ) {
        withContext(Dispatchers.IO) {
            val spec = PatchSpec.builder()
                .apks(apkPaths.map(::File))
                .outputDir(outputDir)
                // Signature bypass level 0: Endcord doesn't need Discord's original signature
                .sigBypassLevel(0)
                .verbose(true)
                .forceOverwrite(true)
                .modules(embeddedModules.map(::File))
                .keystore(KeystoreSpec.of(Signer.keyStore, "password", "alias", "password"))
                .build()

            ApkPatcher(logger, spec).patch()
        }
    }

}
