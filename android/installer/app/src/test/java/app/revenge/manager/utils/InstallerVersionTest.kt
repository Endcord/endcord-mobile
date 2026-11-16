package app.revenge.manager.utils

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class InstallerVersionTest {
    @Test
    fun `version names are read as major, minor and patch`() {
        assertEquals(listOf(1, 0, 3), versionParts("1.0.3"))
        assertEquals(listOf(1, 2, 0), versionParts("v1.2"))
        assertEquals(listOf(2, 0, 0), versionParts("2"))
        assertEquals(listOf(1, 0, 3), versionParts("1.0.3-beta"))
        assertNull(versionParts(""))
        assertNull(versionParts("1.a.3"))
        assertNull(versionParts("1.2.3.4"))
        assertNull(versionParts("1.-2.3"))
    }

    @Test
    fun `only a newer release is an update`() {
        assertTrue(isNewerVersion("1.0.4", "1.0.3"))
        // Where joined digits got it wrong: 1.0.10 is 1010 and 1.1.0 is 110
        assertTrue(isNewerVersion("1.0.10", "1.0.9"))
        assertTrue(isNewerVersion("1.1.0", "1.0.10"))
        assertTrue(isNewerVersion("2.0.0", "1.99.99"))
        assertFalse(isNewerVersion("1.0.3", "1.0.3"))
        assertFalse(isNewerVersion("1.0.2", "1.0.3"))
        assertFalse(isNewerVersion("1.0.9", "1.0.10"))
        assertFalse(isNewerVersion("not a version", "1.0.3"))
        assertFalse(isNewerVersion("1.0.4", "dev"))
    }
}
