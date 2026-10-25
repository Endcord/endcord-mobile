/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.translatecommon

import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.aliucord.Constants
import com.aliucord.Utils
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.OutputStream

/**
 * Saves files the user asked for where they can find them: `Download/Endcord` through MediaStore on Android 10+,
 * and the Endcord folder on older versions, where apps still write to shared storage directly.
 */
internal object Downloads {
    private const val SUBFOLDER = "Endcord"

    /**
     * Writes a file named [fileName] with [write] and returns a human readable path of where it went.
     * Blocks, so call it off the main thread. An existing file with the same name is never overwritten.
     */
    @JvmStatic
    fun save(fileName: String, mimeType: String, write: (OutputStream) -> Unit): String {
        val name = safeName(fileName)
        if (Build.VERSION.SDK_INT >= 29) {
            val resolver = Utils.appContext.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + SUBFOLDER)
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IOException("Couldn't create the file in Downloads")
            try {
                (resolver.openOutputStream(uri) ?: throw IOException("Couldn't open the file for writing")).use(write)
                values.clear()
                values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            } catch (e: Throwable) {
                try {
                    resolver.delete(uri, null, null)
                } catch (_: Throwable) {
                }
                throw e
            }
            // MediaStore may have renamed the file to avoid a clash, so read the final name back
            val finalName = try {
                resolver.query(uri, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)?.use {
                    if (it.moveToFirst()) it.getString(0) else null
                }
            } catch (_: Throwable) {
                null
            } ?: name
            return "${Environment.DIRECTORY_DOWNLOADS}/$SUBFOLDER/$finalName"
        }

        val dir = File(Constants.BASE_PATH, "downloads")
        if (!dir.exists() && !dir.mkdirs()) throw IOException("Couldn't create ${dir.absolutePath}")
        val file = uniqueFile(dir, name)
        try {
            FileOutputStream(file).use(write)
        } catch (e: Throwable) {
            file.delete()
            throw e
        }
        return file.absolutePath
    }

    /** [save] for content that is already in memory. */
    @JvmStatic
    fun save(fileName: String, mimeType: String, bytes: ByteArray): String = save(fileName, mimeType) { it.write(bytes) }

    /** Replaces characters that file systems or MediaStore reject. */
    @JvmStatic
    fun safeName(name: String): String {
        val cleaned = name.replace(Regexes.UNSAFE_FILE_CHARS, "_").trim().trim('.')
        return if (cleaned.isEmpty()) "file" else cleaned.take(120)
    }

    private fun uniqueFile(dir: File, name: String): File {
        var file = File(dir, name)
        if (!file.exists()) return file
        val dot = name.lastIndexOf('.')
        val base = if (dot > 0) name.substring(0, dot) else name
        val ext = if (dot > 0) name.substring(dot) else ""
        var i = 1
        while (file.exists()) file = File(dir, "$base ($i)$ext").also { i++ }
        return file
    }

    /** A guess of the MIME type of a CDN url or file name, from its extension. */
    @JvmStatic
    fun mimeOf(name: String): String = when (name.substringBefore('?').substringAfterLast('.', "").lowercase()) {
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "gif" -> "image/gif"
        "webp" -> "image/webp"
        "json" -> "application/json"
        "zip" -> "application/zip"
        "txt" -> "text/plain"
        "csv" -> "text/csv"
        "md" -> "text/markdown"
        "html" -> "text/html"
        else -> "application/octet-stream"
    }
}

/** Shared patterns, compiled once. Java's Pattern, since Discord's jar shadows Kotlin's Regex. */
internal object Regexes {
    @JvmField
    val UNSAFE_FILE_CHARS: java.util.regex.Pattern = java.util.regex.Pattern.compile("[\\\\/:*?\"<>|\\p{Cntrl}]")
}

private fun String.replace(pattern: java.util.regex.Pattern, replacement: String): String =
    pattern.matcher(this).replaceAll(replacement)
