package io.github.revenge.xposed.tweaks

import android.content.SharedPreferences
import io.github.revenge.xposed.RevengeConstants
import java.io.File
import java.lang.reflect.Proxy
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

/** The accepted release sequence, kept in two places so a plugin rewriting the file can't lower it */
class ReleaseSequenceTest {
    private val dir: File = Files.createTempDirectory("sequence").toFile()

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    private class MemoryStore(var value: Long? = null, var failReads: Boolean = false, var failWrites: Boolean = false) : SequenceStore {
        var writes = 0
        override fun read(): Long? = if (failReads) throw java.io.IOException("read") else value
        override fun write(sequence: Long) {
            if (failWrites) throw java.io.IOException("write")
            writes++
            value = sequence
        }
    }

    /** SharedPreferences backed by a map: a proxy, so it doesn't depend on which methods this SDK's interface has */
    private fun fakePrefs(map: MutableMap<String, Any?> = mutableMapOf()): SharedPreferences {
        val pending = mutableMapOf<String, Any?>()
        lateinit var editor: SharedPreferences.Editor
        editor = Proxy.newProxyInstance(javaClass.classLoader, arrayOf(SharedPreferences.Editor::class.java)) { _, method, args ->
            when (method.name) {
                "putLong" -> { pending[args[0] as String] = args[1]; editor }
                "commit" -> { map.putAll(pending); pending.clear(); true }
                "apply" -> { map.putAll(pending); pending.clear(); null }
                else -> throw UnsupportedOperationException(method.name)
            }
        } as SharedPreferences.Editor
        return Proxy.newProxyInstance(javaClass.classLoader, arrayOf(SharedPreferences::class.java)) { _, method, args ->
            when (method.name) {
                "contains" -> map.containsKey(args[0])
                "getLong" -> map[args[0]] ?: args[1]
                "edit" -> editor
                else -> throw UnsupportedOperationException(method.name)
            }
        } as SharedPreferences
    }

    @Test
    fun `the larger copy counts`() {
        val file = MemoryStore(3)
        val prefs = MemoryStore(9)
        assertEquals(9, ReleaseSequence(listOf(file, prefs)).accepted())
        // A plugin lowers or deletes the file: nothing changes
        file.value = 0
        assertEquals(9, ReleaseSequence(listOf(file, prefs)).accepted())
        file.value = null
        assertEquals(9, ReleaseSequence(listOf(file, prefs)).accepted())
        // A copy that can't be read counts as none
        prefs.failReads = true
        file.value = 4
        assertEquals(4, ReleaseSequence(listOf(file, prefs)).accepted())
        assertEquals(0, ReleaseSequence(listOf(MemoryStore(), MemoryStore(-5))).accepted())
        assertEquals(0, ReleaseSequence(emptyList()).accepted())
    }

    @Test
    fun `accepting writes every copy and never lowers it`() {
        val file = MemoryStore()
        val prefs = MemoryStore()
        val sequence = ReleaseSequence(listOf(file, prefs))
        sequence.accept(5)
        assertEquals(5L, file.value)
        assertEquals(5L, prefs.value)
        sequence.accept(3)
        assertEquals(5L, file.value)
        assertEquals(5L, prefs.value)
        // A copy that has it already isn't written again
        assertEquals(1, file.writes)
        sequence.accept(8)
        assertEquals(8L, file.value)
        assertEquals(8L, prefs.value)
    }

    @Test
    fun `one copy that can't be written doesn't stop the other`() {
        val file = MemoryStore()
        val prefs = MemoryStore(failWrites = true)
        ReleaseSequence(listOf(file, prefs)).accept(6)
        assertEquals(6L, file.value)
        assertFailsWith<java.io.IOException> {
            ReleaseSequence(listOf(MemoryStore(failWrites = true), MemoryStore(failWrites = true))).accept(6)
        }
    }

    @Test
    fun `sync puts back a copy that was lowered`() {
        val file = MemoryStore(1)
        val prefs = MemoryStore(7)
        ReleaseSequence(listOf(file, prefs)).sync()
        assertEquals(7L, file.value)
        // Nothing accepted yet: nothing written
        val empty = MemoryStore()
        ReleaseSequence(listOf(empty)).sync()
        assertEquals(0, empty.writes)
    }

    @Test
    fun `the file copy`() {
        val file = File(dir, "release-sequence")
        val store = FileSequenceStore(file)
        assertNull(store.read())
        store.write(12)
        assertEquals(12L, store.read())
        file.writeText(" 13\n")
        assertEquals(13L, store.read())
        file.writeText("garbage")
        assertNull(store.read())
    }

    @Test
    fun `the preferences copy`() {
        assertNull(PrefsSequenceStore { null }.read())
        assertFailsWith<IllegalStateException> { PrefsSequenceStore { null }.write(1) }

        val prefs = fakePrefs()
        val store = PrefsSequenceStore { prefs }
        assertNull(store.read())
        store.write(21)
        assertEquals(21L, store.read())
    }

    @Test
    fun `a plugin rewriting the file can't lower what the preferences keep`() {
        val file = File(dir, "release-sequence")
        val prefs = fakePrefs()
        val sequence = ReleaseSequence(listOf(FileSequenceStore(file), PrefsSequenceStore { prefs }))
        sequence.accept(30)
        file.writeText("0")
        assertEquals(30, sequence.accepted())
        file.delete()
        assertEquals(30, sequence.accepted())
        sequence.sync()
        assertEquals("30", file.readText())
    }

    @Test
    fun `the updater reads the file copy`() {
        val filesDir = File(dir, RevengeConstants.FILES_DIR).apply { mkdirs() }
        File(filesDir, "release-sequence").writeText("4")
        RevengeUpdater.init(dir.path)
        assertEquals(4, RevengeUpdater.acceptedSequence())
        // What AtomicFile left from a write cut short on Android 7 to 10 is put back first
        File(filesDir, "release-sequence.bak").writeText("5")
        RevengeUpdater.init(dir.path)
        assertEquals(5, RevengeUpdater.acceptedSequence())
    }
}
