package io.github.revenge.xposed

import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.Build
import kotlinx.serialization.json.Json
import java.io.File
import java.io.InputStream
import java.io.OutputStream

fun File.ensureDir() {
    if (!isDirectory) delete()
    mkdirs()
}

fun File.ensureFile() {
    if (!isFile) deleteRecursively()
}

fun File.openFileGuarded() {
    if (!exists()) throw Error("Path does not exist: $path")
    if (!isFile) throw Error("Path is not a file: $path")
}

/** Requires the path to be inside the [parent] directory, or throws an [IllegalArgumentException]. */
fun File.requireInside(parent: File, what: String, value: String) {
    require(canonicalPath.startsWith(parent.canonicalPath + File.separator)) {
        "$what escapes the directory: $value"
    }
}

/**
 * Copies at most [budget] bytes to [dest] and returns the number copied.
 * Calls [onExceeded] the moment the stream would go past the budget.
 */
inline fun InputStream.copyToCapped(
    dest: OutputStream,
    budget: Long,
    onExceeded: () -> Nothing,
): Long {
    var copied = 0L
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    while (true) {
        val read = read(buffer)
        if (read == -1) return copied
        if (copied + read > budget) onExceeded()
        dest.write(buffer, 0, read)
        copied += read
    }
}

/**
 * Whether the app is a developer's own build (FLAG_DEBUGGABLE): the installer only sets it from a hidden developer
 * option, and CI and `adb run-as` setups use it. What a plugin could plant runs there as it always has; elsewhere the
 * loader asks or refuses (preloads, the custom bundle link).
 */
val ApplicationInfo.isDebuggable: Boolean
    get() = (flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

/** Whether this runs on Android (ART), rather than in the JVM the unit tests run in */
internal val runsOnAndroid: Boolean =
    System.getProperty("java.vm.vendor").orEmpty().contains("Android", ignoreCase = true) ||
        System.getProperty("java.vm.name") == "Dalvik"

fun Context.versionName(): String {
    val pInfo = packageManager.getPackageInfo(packageName, 0)
    return pInfo.versionName ?: "unknown"
}

fun Context.versionCode(): Long {
    val pInfo = packageManager.getPackageInfo(packageName, 0)
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) pInfo.longVersionCode
    else @Suppress("DEPRECATION") pInfo.versionCode.toLong()
}

val RevengeJson: Json = Json { ignoreUnknownKeys = true }