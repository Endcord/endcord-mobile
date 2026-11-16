package io.github.revenge.xposed.tweaks

import android.content.SharedPreferences
import io.github.revenge.xposed.writeBytesAtomically
import java.io.File

/** One place the highest accepted release sequence is kept */
internal interface SequenceStore {
    /** The sequence kept here: null when there's none, or it can't be read */
    fun read(): Long?

    fun write(sequence: Long)
}

/**
 * The highest release sequence this install accepted: what makes older releases refused, and a bundle without a release
 * refused once a signed one was accepted ([unsignedReleaseAllowed]).
 *
 * Kept in more than one [SequenceStore]: the file in the loader's folder, which Discord's file module (and so a plugin)
 * can rewrite or delete, and the app's SharedPreferences, which neither it nor the loader's file bridge reaches. The
 * larger of them counts, so lowering one copy changes nothing, and every write goes to all of them.
 */
internal class ReleaseSequence(private val stores: List<SequenceStore>) {
    fun accepted(): Long = stores.maxOfOrNull { runCatching { it.read() }.getOrNull() ?: 0L }?.coerceAtLeast(0L) ?: 0L

    /**
     * Remembers [sequence] as accepted, or the one accepted before if that's higher: never lowers it. Writes each store
     * that doesn't have it yet; throws only when none of them could be written.
     */
    fun accept(sequence: Long) {
        val value = maxOf(sequence, accepted())
        var written = false
        var failure: Throwable? = null
        for (store in stores) {
            runCatching {
                if (store.read() != value) store.write(value)
                written = true
            }.onFailure { failure = failure ?: it }
        }
        if (!written) failure?.let { throw it }
    }

    /** Brings every store up to the highest one: a copy lowered or deleted since gets it back */
    fun sync() {
        val value = accepted()
        if (value > 0L) accept(value)
    }
}

/**
 * The sequence as a file of its own. Written to a temporary file renamed over it, so a write cut short leaves the one
 * before; AtomicFile's .bak from older writes is put back before it's read ([restoreInterruptedAtomicFile]).
 */
internal class FileSequenceStore(private val file: File) : SequenceStore {
    override fun read(): Long? = if (file.isFile) file.readText().trim().toLongOrNull() else null

    override fun write(sequence: Long) {
        file.writeBytesAtomically(sequence.toString().toByteArray())
    }
}

/**
 * The bundle the boot guard may go back to ([BundleBootGuard.TrustedPrevious]), in the loader's preferences with the
 * release sequence: out of reach of Discord's file module, which can write the cache folder the guard keeps it in
 */
internal class PrefsTrustedPrevious(private val prefs: () -> SharedPreferences?) : BundleBootGuard.TrustedPrevious {
    private companion object {
        const val KEY = "rollbackBundleSha256"
    }

    override fun get(): String? = prefs()?.getString(KEY, null)

    override fun set(hash: String) {
        val prefs = prefs() ?: throw IllegalStateException("No Context yet for the loader's preferences")
        if (!prefs.edit().putString(KEY, hash).commit()) throw java.io.IOException("Couldn't note the bundle to go back to")
    }
}

/** The sequence in the app's SharedPreferences, once there's a Context to open them with; [prefs] returns null until then */
internal class PrefsSequenceStore(private val prefs: () -> SharedPreferences?) : SequenceStore {
    companion object {
        /** The loader's own preferences file, apart from Discord's */
        const val PREFS_NAME = "endcord_loader_security"
        private const val KEY = "acceptedReleaseSequence"
    }

    override fun read(): Long? = prefs()?.takeIf { it.contains(KEY) }?.getLong(KEY, 0L)

    override fun write(sequence: Long) {
        val prefs = prefs() ?: throw IllegalStateException("No Context yet for the loader's preferences")
        if (!prefs.edit().putLong(KEY, sequence).commit()) throw java.io.IOException("Couldn't save the release sequence")
    }
}
