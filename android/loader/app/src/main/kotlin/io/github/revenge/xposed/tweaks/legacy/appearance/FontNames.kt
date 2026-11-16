package io.github.revenge.xposed.tweaks.legacy.appearance

import java.io.File

/**
 * Whether a font's name, or the name of one of its files, can name a folder or file: both make the path a font is saved
 * at, and the files there that aren't the font's are deleted. fonts.json is what the bundle saved from a link anyone
 * can share, so the rule is the bundle's own (lib/addons/fonts) and the iOS tweak's: no slashes, no control characters,
 * not starting with a dot, and at most 100 characters.
 */
internal fun isSafeFontName(name: String?): Boolean =
    name != null && name.isNotEmpty() && name.length <= 100 && !name.startsWith(".") &&
            name.none { it == '/' || it == '\\' || it < ' ' }

/** What React Native adds to a font file's name for each `Typeface` style: normal, bold, italic, bold italic */
internal val FONT_STYLE_SUFFIXES = arrayOf("", "_bold", "_italic", "_bold_italic")

/** A font file's extensions, in the order a file is looked for */
internal val FONT_FILE_EXTENSIONS = arrayOf(".ttf", ".otf")

/**
 * The downloaded file a `<font set>:<font>` family name refers to, with [fileExt] (".ttf"), or null when the name isn't
 * one. The family name comes from whatever styles a view, so both parts have to be names that stay inside the fonts
 * folder, and the lookup must not touch anything on the way either. The bundle saves a font's files as
 * `downloads/fonts/<font set>/<font>.<ext>`.
 */
internal fun downloadedFontFile(downloadsDir: File?, fontFamilyName: String, fileExt: String): File? {
    val split = fontFamilyName.split(":")
    if (split.size != 2) return null
    val (customName, refName) = split
    if (!isSafeFontName(customName) || !isSafeFontName(refName)) return null
    val downloads = downloadsDir ?: return null
    return File(downloads, "$customName/$refName$fileExt")
}

/**
 * Discord's name for a font in a style, as its own lookup makes it (`vf.a.a` in Discord 353.11): italic adds "Italic",
 * bold turns Normal, Medium and Semibold into Bold. So a picked font's files are named as Discord's are: ggsans-Bold,
 * ggsans-NormalItalic, rather than React Native's "_bold" and "_italic".
 */
internal fun discordStyledName(name: String, style: Int): String {
    var out = name
    if (style and 2 != 0 && !out.contains("Italic", ignoreCase = true)) out += "Italic"
    if (style and 1 != 0) {
        for (weight in arrayOf("Normal", "Medium", "Semibold")) out = out.replace(weight, "Bold", ignoreCase = true)
    }
    return out.replace("ItalicItalic", "Italic", ignoreCase = true).replace("BoldBold", "Bold", ignoreCase = true)
}

/** A font file that's there to draw with: a file, not an empty one left by a download that never finished */
private fun File.isFontFile() = isFile && length() > 0

/**
 * The file a family name is drawn with in [style], or null when it's left to Discord: a `<font set>:<font>` file in
 * [downloadsDir], or in the selected font's folder [selectedDir] a file named as Discord names it for the style, or as
 * React Native does.
 */
internal fun customFontFile(name: String, style: Int, downloadsDir: File?, selectedDir: File?): File? {
    for (ext in FONT_FILE_EXTENSIONS) {
        downloadedFontFile(downloadsDir, name, ext)?.takeIf { it.isFontFile() }?.let { return it }
    }
    if (selectedDir == null || !isSafeFontName(name)) return null
    val suffix = FONT_STYLE_SUFFIXES.getOrElse(style) { "" }
    for (candidate in listOf(discordStyledName(name, style), "$name$suffix").distinct()) {
        if (!isSafeFontName(candidate)) continue
        for (ext in FONT_FILE_EXTENSIONS) File(selectedDir, "$candidate$ext").takeIf { it.isFontFile() }?.let { return it }
    }
    return null
}

/** The names in React Native's comma-separated family list, as Discord writes them ("ggsans-Normal, NotoSans-Normal") */
internal fun familyNames(rawName: String): List<String> = rawName.split(",").map { it.trim() }.filter { it.isNotEmpty() }

/**
 * Whether React Native's comma-separated family list [rawName] names a font the user picked in [style]. Only those are
 * drawn by the loader; every other family is left to Discord's own lookup.
 */
internal fun namesCustomFont(rawName: String, style: Int, downloadsDir: File?, selectedDir: File?): Boolean =
    familyNames(rawName).any { customFontFile(it, style, downloadsDir, selectedDir) != null }
