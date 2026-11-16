package io.github.revenge.xposed

import java.io.File
import java.io.FileOutputStream
import java.io.IOException

/** One write of a temporary file at a time, as each file has one temporary name beside it */
private val atomicWriteLock = Any()

/**
 * Writes [bytes] to a temporary file beside this one, flushed to the disk, and renames it over this one: a reader that
 * opens the file plainly (readBytes, Hermes' runFile) finds the old file or the new one, never half of one.
 *
 * Unlike android.util.AtomicFile, which on Android 7 to 10 moves the old file to a .bak, rewrites this one in place and
 * leaves putting the .bak back to its own openRead, so a write cut short leaves half a file to every other reader.
 */
internal fun File.writeBytesAtomically(bytes: ByteArray) = synchronized(atomicWriteLock) {
    val dir = absoluteFile.parentFile ?: throw IOException("No folder for $this")
    dir.mkdirs()
    val tmp = File(dir, "$name.tmp")
    try {
        FileOutputStream(tmp).use { out ->
            out.write(bytes)
            out.flush()
            out.fd.sync()
        }
        // A rename within a folder replaces the file at once on Android; elsewhere (the tests on Windows) it may need
        // the old one gone first
        if (!tmp.renameTo(this)) {
            delete()
            if (!tmp.renameTo(this)) throw IOException("Couldn't replace $this")
        }
    } catch (e: Throwable) {
        tmp.delete()
        throw e
    }
    // What AtomicFile kept from an older write is no longer this file's
    File(dir, "$name.bak").delete()
}

/**
 * For a file AtomicFile used to write: when a write of it was cut short on Android 7 to 10, the .bak beside it is the
 * last whole copy, which only AtomicFile.openRead would have put back. Puts it back, for readers that read it plainly.
 */
internal fun File.restoreInterruptedAtomicFile() {
    val backup = File(absoluteFile.parentFile ?: return, "$name.bak")
    if (!backup.isFile) return
    if (!backup.renameTo(this)) {
        delete()
        backup.renameTo(this)
    }
}
