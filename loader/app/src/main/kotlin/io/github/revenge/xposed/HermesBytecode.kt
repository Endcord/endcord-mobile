package io.github.revenge.xposed

import android.content.Context
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * The Hermes bytecode version of the Discord on this phone, read from the header of its own bundle.
 *
 * Endcord is published as plain JS and, for the bytecode versions Discord ships, precompiled: bytecode starts faster
 * and takes less memory, since Hermes needn't parse and compile a megabyte of source on every start. Bytecode only
 * loads on the exact version it was compiled for, so the version is read rather than assumed.
 */
object HermesBytecode {
    private const val MAGIC = 0x1F1903C103BC1FC6L
    private const val DISCORD_BUNDLE = "index.android.bundle"

    @Volatile
    private var cached: Int? = null

    @Volatile
    private var read = false

    /** The version, or null when the bundle isn't bytecode or couldn't be read */
    fun version(context: Context): Int? {
        if (read) return cached
        cached = runCatching {
            context.assets.open(DISCORD_BUNDLE).use { input ->
                val header = ByteArray(12)
                if (input.read(header) != header.size) return@use null
                val buffer = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN)
                if (buffer.getLong(0) != MAGIC) null else buffer.getInt(8)
            }
        }.getOrNull()
        read = true
        return cached
    }
}
