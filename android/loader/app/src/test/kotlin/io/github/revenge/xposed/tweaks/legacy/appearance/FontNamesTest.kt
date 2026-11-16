package io.github.revenge.xposed.tweaks.legacy.appearance

import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
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

    /** downloads/fonts with a selected font "Set" that has a normal and a bold file */
    private fun fonts(): Pair<File, File> {
        val downloads = createTempDirectory("fonts").toFile()
        val set = File(downloads, "Set").apply { mkdirs() }
        File(set, "ggsans-Normal.ttf").writeText("font")
        File(set, "ggsans-Bold_bold.otf").writeText("font")
        return downloads to set
    }

    @Test
    fun `a font set reference names the file the bundle saved, with one dot`() {
        val (downloads, set) = fonts()
        assertEquals(File(set, "ggsans-Normal.ttf"), downloadedFontFile(downloads, "Set:ggsans-Normal", ".ttf"))
        assertTrue(downloadedFontFile(downloads, "Set:ggsans-Normal", ".ttf")!!.isFile)
    }

    @Test
    fun `only a two-part reference with safe parts names a downloaded file`() {
        val (downloads, _) = fonts()
        assertNull(downloadedFontFile(downloads, "ggsans-Normal", ".ttf"))
        assertNull(downloadedFontFile(downloads, "a:b:c", ".ttf"))
        assertNull(downloadedFontFile(downloads, "..:ggsans-Normal", ".ttf"))
        assertNull(downloadedFontFile(downloads, "Set:../../evil", ".ttf"))
        assertNull(downloadedFontFile(null, "Set:ggsans-Normal", ".ttf"))
    }

    @Test
    fun `a family the selected font has is drawn by the loader`() {
        val (downloads, set) = fonts()
        assertTrue(namesCustomFont("ggsans-Normal", 0, downloads, set))
        assertTrue(namesCustomFont("ggsans-Bold", 1, downloads, set))
        assertTrue(namesCustomFont("Set:ggsans-Normal", 0, downloads, null))
        // A list where one family is the user's
        assertTrue(namesCustomFont("Roboto, ggsans-Normal", 0, downloads, set))
    }

    @Test
    fun `every other family is left to React Native`() {
        val (downloads, set) = fonts()
        // Discord's own fonts, and a style the selected font has no file for
        assertFalse(namesCustomFont("ggsans-Semibold", 0, downloads, set))
        assertFalse(namesCustomFont("ggsans-Normal", 1, downloads, set))
        assertFalse(namesCustomFont("", 0, downloads, set))
        assertFalse(namesCustomFont(" , ", 0, downloads, set))
        // No font selected
        assertFalse(namesCustomFont("ggsans-Normal", 0, null, null))
        // A style past bold italic is drawn as normal
        assertTrue(namesCustomFont("ggsans-Normal", 9, downloads, set))
    }

    @Test
    fun `a family name can't reach a file outside the selected font's folder`() {
        val (downloads, set) = fonts()
        File(downloads, "outside.ttf").writeText("font")
        assertFalse(namesCustomFont("../outside", 0, downloads, set))
        assertFalse(namesCustomFont("..\\outside", 0, downloads, set))
    }

    @Test
    fun `a style is named as Discord's own lookup names it`() {
        assertEquals("ggsans-Normal", discordStyledName("ggsans-Normal", 0))
        assertEquals("ggsans-Bold", discordStyledName("ggsans-Normal", 1))
        assertEquals("ggsans-Bold", discordStyledName("ggsans-Semibold", 1))
        assertEquals("ggsans-Bold", discordStyledName("ggsans-Medium", 1))
        assertEquals("ggsans-Bold", discordStyledName("ggsans-Bold", 1))
        assertEquals("ggsans-NormalItalic", discordStyledName("ggsans-Normal", 2))
        assertEquals("ggsans-NormalItalic", discordStyledName("ggsans-NormalItalic", 2))
        assertEquals("ggsans-BoldItalic", discordStyledName("ggsans-Normal", 3))
        assertEquals("ggsans-ExtraBold", discordStyledName("ggsans-ExtraBold", 0))
    }

    @Test
    fun `a picked font's files are found by Discord's names, and empty ones aren't fonts`() {
        val downloads = createTempDirectory("fonts").toFile()
        val set = File(downloads, "Barlow").apply { mkdirs() }
        File(set, "ggsans-Normal.ttf").writeText("font")
        File(set, "ggsans-Bold.ttf").writeText("font")
        File(set, "ggsans-NormalItalic.ttf").writeText("font")
        File(set, "ggsans-Medium.ttf").writeText("")
        assertEquals(File(set, "ggsans-Normal.ttf"), customFontFile("ggsans-Normal", 0, downloads, set))
        // Bold text in a family Discord names by weight: drawn with the pack's bold file
        assertEquals(File(set, "ggsans-Bold.ttf"), customFontFile("ggsans-Normal", 1, downloads, set))
        assertEquals(File(set, "ggsans-Bold.ttf"), customFontFile("ggsans-Semibold", 1, downloads, set))
        assertEquals(File(set, "ggsans-NormalItalic.ttf"), customFontFile("ggsans-Normal", 2, downloads, set))
        // A download that never finished leaves Discord's own font in place
        assertNull(customFontFile("ggsans-Medium", 0, downloads, set))
        assertFalse(namesCustomFont("ggsans-Medium, NotoSans-Medium", 0, downloads, set))
        // Discord's family lists
        assertTrue(namesCustomFont("ggsans-Normal, NotoSans-Normal", 0, downloads, set))
        assertEquals(listOf("ggsans-Normal", "NotoSans-Normal"), familyNames(" ggsans-Normal,  NotoSans-Normal ,"))
    }
}
