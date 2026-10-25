/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.actionscommon

import android.app.DownloadManager
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.aliucord.Constants
import java.io.File
import java.io.IOException

/**
 * Writing files for the message action ports.
 *
 * * Files Endcord makes itself (exported messages) go to the Endcord folder, [Constants.BASE_PATH], which
 *   Endcord can always write to because it needs storage access to run at all.
 * * Downloads of other people's files go through Android's [DownloadManager] into `Download/Endcord`, which
 *   works from API 24 to 36 without extra permissions and shows the system's download notification.
 * * Images Endcord renders (quotes, screenshots) go to `Pictures/Endcord` through MediaStore on API 29+ and
 *   straight to the public Pictures folder before that.
 */
internal object Files {
    const val SUBFOLDER = "Endcord"

    private val illegal = Regex("[\\\\/:*?\"<>|\\x00-\\x1f]")

    /** Makes [name] safe to use as a file name on every Android file system. */
    fun sanitize(name: String): String {
        val clean = name.replace(illegal, "_").trim().trim('.')
        return (if (clean.isEmpty()) "file" else clean).take(120)
    }

    /** `name.ext`, or `name (2).ext`, `name (3).ext`... if that already exists in [dir]. */
    fun uniqueFile(dir: File, name: String): File {
        var file = File(dir, name)
        if (!file.exists()) return file
        val dot = name.lastIndexOf('.')
        val base = if (dot > 0) name.substring(0, dot) else name
        val ext = if (dot > 0) name.substring(dot) else ""
        var i = 2
        while (file.exists()) file = File(dir, "$base ($i)$ext").also { i++ }
        return file
    }

    /** Writes [text] to `<Endcord folder>/<folder>/<name>`. Blocking, call it off the main thread. */
    @Throws(IOException::class)
    fun writeToEndcordFolder(folder: String, name: String, text: String): File {
        val dir = File(Constants.BASE_PATH, folder)
        if (!dir.exists() && !dir.mkdirs()) throw IOException("Can't create $dir")
        val file = uniqueFile(dir, sanitize(name))
        file.writeText(text, Charsets.UTF_8)
        return file
    }

    /**
     * Queues [url] for download into `Download/Endcord/<fileName>` with the system download manager.
     * @return the download id
     */
    fun download(context: Context, url: String, fileName: String): Long {
        val name = sanitize(fileName)
        if (Build.VERSION.SDK_INT < 29) {
            // Before scoped storage the download manager needs the sub folder to exist
            try {
                File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), SUBFOLDER).mkdirs()
            } catch (_: Throwable) {
            }
        }
        val request = DownloadManager.Request(Uri.parse(url))
            .setTitle(name)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "$SUBFOLDER/$name")
        @Suppress("DEPRECATION")
        if (Build.VERSION.SDK_INT < 29) request.allowScanningByMediaScanner()
        val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        return manager.enqueue(request)
    }

    /**
     * Saves a PNG to `Pictures/Endcord`. Blocking, call it off the main thread.
     * @return a content uri other apps can open (API 29+), or the file uri before that
     */
    @Throws(IOException::class)
    fun savePicture(context: Context, name: String, png: ByteArray): Uri {
        val fileName = sanitize(name)
        if (Build.VERSION.SDK_INT >= 29) {
            val resolver = context.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                put(MediaStore.MediaColumns.MIME_TYPE, "image/png")
                put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/$SUBFOLDER")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                ?: throw IOException("MediaStore refused the image")
            try {
                resolver.openOutputStream(uri)?.use { it.write(png) } ?: throw IOException("Can't write the image")
                values.clear()
                values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            } catch (e: Throwable) {
                resolver.delete(uri, null, null)
                throw if (e is IOException) e else IOException(e)
            }
            return uri
        }

        @Suppress("DEPRECATION")
        val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), SUBFOLDER)
        if (!dir.exists() && !dir.mkdirs()) throw IOException("Can't create $dir")
        val file = uniqueFile(dir, fileName)
        file.writeBytes(png)
        android.media.MediaScannerConnection.scanFile(context, arrayOf(file.absolutePath), arrayOf("image/png"), null)
        return Uri.fromFile(file)
    }

    /** A temporary file in the app's cache, for attachments Endcord uploads itself. */
    fun cacheFile(context: Context, name: String): File {
        val dir = File(context.cacheDir, "endcord")
        dir.mkdirs()
        return File(dir, sanitize(name))
    }
}
