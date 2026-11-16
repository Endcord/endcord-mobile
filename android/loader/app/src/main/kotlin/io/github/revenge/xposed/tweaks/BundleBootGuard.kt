package io.github.revenge.xposed.tweaks

import io.github.revenge.xposed.RevengeJson
import io.github.revenge.xposed.tweaks.plugins.repos.sha256Hex
import io.github.revenge.xposed.writeBytesAtomically
import kotlinx.serialization.Serializable
import java.io.File

/**
 * Endcord PC's rollback (src/main/updater/rollback.ts there) for the downloaded bundle: a new bundle that doesn't come
 * up three times in a row is set aside, the one before it comes back, and the bad one isn't taken again for a day.
 *
 * A bundle comes up when its JavaScript says so through `endcord.bundle.confirm`, once Discord has stayed up (the
 * bundle's boot guard, core/debug/bootGuard.ts). Only a bundle that came up at least once is kept to go back to.
 *
 * Only for the published releases: a bundle from the user's own link may never say it came up (upstream Revenge, say),
 * and the built-in one has nothing to go back to.
 *
 * Plain files, written to a temporary file and renamed over the old one, so a start cut short never leaves half a
 * state; nothing here needs Android, so it's tested on its own.
 *
 * The cache folder these files are in can also be written with Discord's own file module, which the bridge's file
 * policy doesn't cover: a plugin could put any older signed release in previous/ and a state that sends the start back
 * to it. So the bundle kept to go back to is also noted in [trusted], which only the loader writes (the app's
 * preferences), and only that one is ever put back.
 */
internal class BundleBootGuard(
    private val dir: File,
    /** Where the SHA-256 of the bundle kept to go back to is noted; without one (the tests), previous/ is taken as is */
    private val trusted: TrustedPrevious? = null,
    private val now: () -> Long = System::currentTimeMillis,
) {
    /** The SHA-256 of the one bundle a rollback may put back, kept out of the cache folder's reach */
    internal interface TrustedPrevious {
        fun get(): String?
        fun set(hash: String)
    }

    companion object {
        /** Loads of a new bundle that may fail before the one before it comes back */
        const val FAILED_LOADS_BEFORE_ROLLBACK = 3

        /** How long a bundle that was set aside isn't taken again */
        const val REJECTED_FOR_MS = 24L * 60 * 60 * 1000
        private const val STATE_FILE = "bundle-boot.json"
        private const val PREVIOUS_DIR = "previous"
        private const val CANDIDATE_DIR = "candidate"

        /** What the guard keeps in [dir]: what it puts back over the bundle, so only the loader may write it */
        fun ownedPaths(dir: File): List<File> = listOf(File(dir, STATE_FILE), File(dir, PREVIOUS_DIR), File(dir, CANDIDATE_DIR))
    }

    @Serializable
    internal data class State(
        /** SHA-256 of the bundle these counts are about */
        val bundle: String = "",
        /** Loads since the bundle last came up */
        val loads: Int = 0,
        /** Whether the bundle came up at least once */
        val cameUp: Boolean = false,
        /** Bundles set aside, by SHA-256, with when */
        val rejected: Map<String, Long> = emptyMap(),
        /**
         * SHA-256 of the bundle kept in candidate/: the one that ran without having come up yet when a newer one was
         * written over it. It becomes the one to go back to if it comes up (in that same start), and is dropped if not.
         */
        val candidate: String = "",
    )

    private val stateFile = File(dir, STATE_FILE)
    private val previousDir = File(dir, PREVIOUS_DIR)
    private val candidateDir = File(dir, CANDIDATE_DIR)

    /** The download runs beside the start: one change to the bundle, its files or the state at a time */
    private val lock = Any()

    fun state(): State = runCatching {
        if (stateFile.isFile) RevengeJson.decodeFromString<State>(stateFile.readText()) else State()
    }.getOrDefault(State())

    private fun save(state: State) {
        dir.mkdirs()
        stateFile.writeBytesAtomically(RevengeJson.encodeToString(State.serializer(), state).toByteArray())
    }

    /** Runs [block] under the lock the bundle's files are changed under, to read or write them all at once */
    fun <T> withLock(block: () -> T): T = synchronized(lock, block)

    /** Whether a bundle was set aside less than a day ago, so it isn't taken again yet */
    fun isRejected(bundle: ByteArray): Boolean = synchronized(lock) {
        val at = state().rejected[sha256Hex(bundle)] ?: return false
        stillRejected(at)
    }

    /**
     * Whether a bundle set aside at [at] is still within its day. A clock that went back since (time zone, network time,
     * by hand) leaves `now - at` negative: that counts as within the day, never as over, so it can't cut the hold short.
     */
    private fun stillRejected(at: Long) = now() - at < REJECTED_FOR_MS

    /**
     * Puts [newBundle] in place of the bundle in [current]: [write] writes it and the files that go with it. Under the
     * same lock as the rollback in [beforeLoad], with the check that it wasn't set aside, so a rollback at start can't
     * land between them. Returns false, and writes nothing, for a bundle set aside less than a day ago.
     *
     * The current bundle and its [companions] are kept to go back to first, as in [beforeReplacing]; [running] is the
     * SHA-256 of the bundle running in this process, if a downloaded one does.
     */
    fun replace(current: File, companions: List<File>, newBundle: ByteArray, running: String?, write: () -> Unit): Boolean =
        synchronized(lock) {
            if (isRejected(newBundle)) return false
            val state = state()
            val candidate = keepCurrent(state, current, companions, running)
            // The state last: a start cut short before it finds a bundle it has no counts for, and counts from there
            write()
            save(State(bundle = sha256Hex(newBundle), rejected = state.pruned(), candidate = candidate))
            true
        }

    /**
     * Before a new bundle replaces the current one: the current one, with the files that go with it (its signed
     * release), is kept to go back to, if it came up. If it's the one running ([running]) and hasn't come up yet, it's
     * kept aside instead, to go back to once it does (see [confirm]). Then the counts start over for the new one.
     */
    fun beforeReplacing(current: File, companions: List<File>, newBundle: ByteArray, running: String? = null) = synchronized(lock) {
        val state = state()
        val candidate = keepCurrent(state, current, companions, running)
        save(State(bundle = sha256Hex(newBundle), rejected = state.pruned(), candidate = candidate))
    }

    /** Keeps the bundle in [current] as said in [beforeReplacing]; returns the SHA-256 of the one kept aside, if any */
    private fun keepCurrent(state: State, current: File, companions: List<File>, running: String?): String {
        if (!current.isFile) return state.candidate
        val hash = sha256Hex(current.readBytes())
        if (hash != state.bundle) return state.candidate
        return when {
            state.cameUp -> state.candidate.also {
                copyInto(previousDir, listOf(current) + companions)
                noteTrusted(hash)
            }
            hash == running -> hash.also { copyInto(candidateDir, listOf(current) + companions) }
            else -> state.candidate
        }
    }

    private fun noteTrusted(hash: String) {
        runCatching { trusted?.set(hash) }
    }

    private fun copyInto(target: File, files: List<File>) {
        target.mkdirs()
        for (file in files) {
            val copy = File(target, file.name)
            if (file.isFile) copy.writeBytesAtomically(file.readBytes()) else copy.delete()
        }
    }

    /**
     * Just before the bundle in [current] runs. Counts the load, and after too many that didn't come up puts the
     * previous bundle back over it (with its companions) and sets this one aside; what's in [discardOnRollback] (the
     * bundle's ETag, which would keep the one set aside as current after its day is over) is deleted then. Returns
     * whether it rolled back.
     */
    fun beforeLoad(current: File, companions: List<File>, discardOnRollback: List<File> = emptyList()): Boolean = synchronized(lock) {
        if (!current.isFile) return false
        val hash = sha256Hex(current.readBytes())
        val saved = state()
        // Kept aside in an earlier start, by a bundle that never came up then: nothing to go back to
        if (candidateDir.exists()) candidateDir.deleteRecursively()
        var state = (if (saved.bundle == hash) saved else State(bundle = hash, rejected = saved.rejected)).copy(candidate = "")
        state = state.copy(loads = state.loads + 1)

        val previous = File(previousDir, current.name)
        val previousHash = if (previous.isFile) sha256Hex(previous.readBytes()) else null
        // Only the bundle the loader itself kept to go back to, never one put in previous/ from elsewhere
        val trustedPrevious = trusted == null || (previousHash != null && runCatching { trusted?.get() }.getOrNull() == previousHash)
        if (!state.cameUp && state.loads > FAILED_LOADS_BEFORE_ROLLBACK && previousHash != null && previousHash != hash && trustedPrevious) {
            for (file in listOf(current) + companions) {
                val copy = File(previousDir, file.name)
                if (copy.isFile) file.writeBytesAtomically(copy.readBytes()) else file.delete()
            }
            for (file in discardOnRollback) file.delete()
            val restored = sha256Hex(current.readBytes())
            // The bundle that comes back came up before; the counts start over for it
            save(State(bundle = restored, loads = 1, cameUp = true, rejected = state.pruned() + (hash to now())))
            return true
        }
        save(state)
        false
    }

    /**
     * The bundle with this SHA-256, the one running in this process, came up: its loads stop counting as failed. When a
     * newer bundle was written over it while it ran, it was kept aside ([beforeReplacing]), and is now the one to go back
     * to if the newer one doesn't come up.
     */
    fun confirm(hash: String) = synchronized(lock) {
        val saved = state()
        var state = saved
        if (hash.isNotEmpty() && state.candidate == hash) {
            if (candidateDir.isDirectory) promoteCandidate(hash)
            state = state.copy(candidate = "")
        }
        if (state.bundle == hash) state = state.copy(loads = 0, cameUp = true)
        if (state != saved) save(state)
    }

    /** The bundle kept aside, with its companions, becomes the one to go back to */
    private fun promoteCandidate(hash: String) {
        previousDir.mkdirs()
        val names = listOf(candidateDir, previousDir).flatMap { it.list()?.toList().orEmpty() }.filterNot { it.endsWith(".tmp") }.toSet()
        for (name in names) {
            val from = File(candidateDir, name)
            val to = File(previousDir, name)
            if (from.isFile) to.writeBytesAtomically(from.readBytes()) else to.delete()
        }
        candidateDir.deleteRecursively()
        noteTrusted(hash)
    }

    /**
     * The bundles still set aside, as [stillRejected] says. One set aside "after now" (the clock went back) is kept as set
     * aside now, so its day runs from the clock as it is rather than from a time it may not reach for long.
     */
    private fun State.pruned(): Map<String, Long> {
        val now = now()
        return rejected.filterValues { stillRejected(it) }.mapValues { (_, at) -> minOf(at, now) }
    }
}
