package io.github.revenge.xposed.tweaks.legacy.appearance

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class FontNamesTest {
    @Test
    fun `names that stay in the fonts folder are safe`() {
        assertTrue(isSafeFontName("Inter"))
        assertTrue(isSafeFontName("ggsans-Normal"))
        assertTrue(isSafeFontName("My Font 2.0"))
    }

    @Test
    fun `names that would leave the fonts folder are not`() {
        assertFalse(isSafeFontName(null))
        assertFalse(isSafeFontName(""))
        assertFalse(isSafeFontName(".."))
        assertFalse(isSafeFontName("../../preloads/evil"))
        assertFalse(isSafeFontName("..\\..\\evil"))
        assertFalse(isSafeFontName(".hidden"))
        assertFalse(isSafeFontName("a\u0000b"))
        assertFalse(isSafeFontName("a\nb"))
        assertFalse(isSafeFontName("x".repeat(101)))
    }
}
