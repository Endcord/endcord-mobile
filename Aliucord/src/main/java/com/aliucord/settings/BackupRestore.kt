/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.aliucord.settings

import androidx.fragment.app.FragmentManager
import com.aliucord.Constants
import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.fragments.ConfirmDialog
import com.aliucord.fragments.SelectDialog
import com.aliucord.i18n.I18n
import java.io.File
import java.text.SimpleDateFormat
import java.util.*
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/**
 * Endcord PC's "Backup & Restore": every settings file (Endcord's own and every plugin's) is saved to one zip in
 * the Endcord/backups folder, which can be restored after reinstalling or copied to another device.
 */
internal object BackupRestore {
    private val logger = Logger("BackupRestore")

    /** Where backups are written and looked for. */
    val backupsDir = File(Constants.BASE_PATH, "backups")

    /** Saves all settings to a new backup zip, off the main thread. */
    fun export() = Utils.threadPool.execute {
        try {
            val settingsDir = File(Constants.SETTINGS_PATH)
            val files = settingsDir.listFiles { f -> f.isFile && f.name.endsWith(".json") }.orEmpty()
            if (!backupsDir.exists() && !backupsDir.mkdirs()) throw IllegalStateException("Can't create $backupsDir")

            val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ROOT).format(Date())
            val target = File(backupsDir, "endcord-backup-$stamp.zip")
            ZipOutputStream(target.outputStream().buffered()).use { zip ->
                for (file in files) {
                    zip.putNextEntry(ZipEntry(file.name))
                    file.inputStream().use { it.copyTo(zip) }
                    zip.closeEntry()
                }
            }
            Utils.showToast(I18n.t("Backup saved.") + " " + target.absolutePath, showLonger = true)
        } catch (e: Throwable) {
            logger.errorToast(I18n.t("Failed to save the backup"), e)
        }
    }

    /** Lets the user pick one of the backups in [backupsDir] and restores it. */
    fun pickAndImport(fragmentManager: FragmentManager) {
        val backups = backupsDir.listFiles { f -> f.isFile && f.name.endsWith(".zip") }
            .orEmpty()
            .sortedByDescending { it.lastModified() }
        if (backups.isEmpty()) {
            Utils.showToast(I18n.t("No backups found in {folder}", "folder" to backupsDir.absolutePath), showLonger = true)
            return
        }

        SelectDialog().apply {
            title = I18n.t("Import Settings")
            items = backups.map { it.name }.toTypedArray()
            onResultListener = { index -> confirmImport(backups[index], fragmentManager) }
        }.show(fragmentManager, "Import Settings")
    }

    private fun confirmImport(backup: File, fragmentManager: FragmentManager) {
        val dialog = ConfirmDialog()
            .setTitle(I18n.t("Import Settings"))
            .setDescription(I18n.t("Importing a settings file will overwrite your current settings.") + "\n\n" +
                I18n.t("Endcord restarts once the backup is restored."))
            .setIsDangerous(true)
        dialog.setOnOkListener {
            dialog.dismiss()
            restore(backup)
        }
        dialog.show(fragmentManager, "Confirm Import")
    }

    private fun restore(backup: File) = Utils.threadPool.execute {
        try {
            val settingsDir = File(Constants.SETTINGS_PATH)
            if (!settingsDir.exists()) settingsDir.mkdirs()

            // Extract to a temporary folder first, so a broken backup never leaves half-restored settings
            val staging = File(settingsDir.parentFile, ".restore")
            staging.deleteRecursively()
            staging.mkdirs()
            var count = 0
            ZipInputStream(backup.inputStream().buffered()).use { zip ->
                while (true) {
                    val entry = zip.nextEntry ?: break
                    val name = entry.name
                    // Only plain settings files, never paths that could escape the settings folder
                    if (entry.isDirectory || !name.endsWith(".json") || name.contains('/') || name.contains('\\') || name.startsWith(".")) continue
                    File(staging, name).outputStream().use { zip.copyTo(it) }
                    count++
                }
            }
            if (count == 0) {
                staging.deleteRecursively()
                Utils.showToast(I18n.t("This backup doesn't contain any settings."), showLonger = true)
                return@execute
            }
            for (file in staging.listFiles().orEmpty()) file.copyTo(File(settingsDir, file.name), overwrite = true)
            staging.deleteRecursively()

            Utils.showToast(I18n.t("Settings imported successfully!"))
            // Restart right away: settings held in memory would otherwise overwrite the restored files
            Utils.mainThread.postDelayed({ Utils.restartAliucord(Utils.appActivity) }, 1200)
        } catch (e: Throwable) {
            logger.errorToast(I18n.t("Failed to restore the backup"), e)
        }
    }
}
