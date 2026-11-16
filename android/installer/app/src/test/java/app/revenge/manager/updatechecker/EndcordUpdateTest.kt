package app.revenge.manager.updatechecker

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** When the home screen offers to update Endcord, and the update checker says so: a published loader Endcord hasn't */
class EndcordUpdateTest {
    private val a = "0c47c676f2c413c9358680023c7e26dc578f5992ccb13f77e7a6624af567c314"
    private val b = "9a222e0b58ad559a918e5f4a9e19ddf5bb85904bda74dfb184ae178bc86f065c"

    @Test
    fun `another published loader is an update`() {
        assertTrue(isOtherLoader(a, b))
    }

    @Test
    fun `the same loader isn't, however its hex is written`() {
        assertFalse(isOtherLoader(a, a))
        assertFalse(isOtherLoader(a, a.uppercase()))
    }

    @Test
    fun `nothing is said when either isn't known`() {
        // An install before installs noted their loader, with nothing in the cache; a release that lists no loader
        assertFalse(isOtherLoader("", b))
        assertFalse(isOtherLoader(a, null))
        assertFalse(isOtherLoader(a, ""))
    }
}
