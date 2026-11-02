package io.github.revenge.xposed.tweaks.legacy.appearance

/**
 * Whether a font's name, or the name of one of its files, can name a folder or file: both make the path a font is saved
 * at, and the files there that aren't the font's are deleted. fonts.json is what the bundle saved from a link anyone
 * can share, so the rule is the bundle's own (lib/addons/fonts) and the iOS tweak's: no slashes, no control characters,
 * not starting with a dot, and at most 100 characters.
 */
internal fun isSafeFontName(name: String?): Boolean =
    name != null && name.isNotEmpty() && name.length <= 100 && !name.startsWith(".") &&
            name.none { it == '/' || it == '\\' || it < ' ' }
