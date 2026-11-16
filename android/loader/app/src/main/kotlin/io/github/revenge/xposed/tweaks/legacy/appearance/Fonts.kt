@file:Suppress("DEPRECATION")

package io.github.revenge.xposed.tweaks.legacy.appearance

import android.content.res.AssetManager
import android.graphics.Typeface
import android.graphics.Typeface.CustomFallbackBuilder
import android.graphics.fonts.Font
import android.graphics.fonts.FontFamily
import android.os.Build
import io.github.revenge.Logger
import io.github.revenge.xposed.*
import io.github.revenge.xposed.tweaks.legacy.RevengePayloadBuilder
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.coroutines.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.put
import java.io.File
import java.io.IOException
import java.lang.reflect.Method

@Serializable
data class FontDefinition(
    val name: String? = null,
    val description: String? = null,
    val spec: Int? = null,
    val main: Map<String, String>,
)

/**
 * Custom font loading + ReactFontManager hijack.
 */
val fonts by tweak {
    val log: Logger = this.log

    // Without the lookup to hook, no font can be drawn: the bundle isn't told fonts work, so it doesn't offer them
    val createAssetTypeface = findCreateAssetTypeface(classLoader)
    if (createAssetTypeface == null) {
        log.w("React Native's createAssetTypeface wasn't found; custom fonts are off")
        return@tweak
    }

    FontsState.log = log
    log.i("Custom fonts are drawn through ${createAssetTypeface.declaringClass.name}.${createAssetTypeface.name}")
    createAssetTypeface.hook {
        before {
            // Only a font the user picked is drawn here; every other family stays Discord's own
            val fontFamilyName = args[0] as? String ?: return@before
            val style = args[1] as? Int ?: return@before
            val assetManager = args[2] as? AssetManager ?: return@before
            val custom = FontsState.hasCustomFont(fontFamilyName, style)
            FontsState.noteLookup(log, fontFamilyName, style, custom)
            if (!custom) return@before
            runCatching { FontsState.createAssetTypeface(fontFamilyName, style, assetManager) }
                .onFailure { log.e("Unable to load the font $fontFamilyName", it) }
                .getOrNull()
                ?.let { result = it }
        }
    }

    RevengePayloadBuilder.contribute { put("fontPatch", 2) }

    withAppContext { ctx ->
        val dataDir = ctx.dataDir.absolutePath
        val fontDefFile = File(dataDir, "${RevengeConstants.FILES_DIR}/fonts.json").apply { ensureFile() }
        if (!fontDefFile.exists()) return@withAppContext

        val fontDef = try {
            RevengeJson.decodeFromString<FontDefinition>(fontDefFile.readText())
        } catch (e: Throwable) {
            log.w("fonts.json malformed: ${e.message}")
            return@withAppContext
        }
        // The names make paths under the fonts folder, and nothing outside it may be written or deleted
        val setName = fontDef.name ?: return@withAppContext
        if (!isSafeFontName(setName)) {
            log.w("fonts.json names a font that can't be saved as a folder; not applying it")
            return@withAppContext
        }

        val downloadsDir = File(dataDir, "${RevengeConstants.FILES_DIR}/downloads/fonts").apply { ensureDir() }
        val setDir = File(downloadsDir, setName).apply { ensureDir() }
        FontsState.fontsDownloadsDir = downloadsDir
        FontsState.fontsAbsPath = setDir.absolutePath + "/"

        // Prune stale font files for this set, and downloads that never finished
        setDir.listFiles()?.forEach { file ->
            val fileName = file.name
            if (fileName.startsWith(".")) {
                if (fileName.endsWith(".part")) file.delete()
            } else {
                // Saved as <font>.ttf or <font>.otf, by the bundle and below: a font's name may hold dots itself
                if (fontDef.main.keys.none { name -> FONT_FILE_EXTENSIONS.any { fileName == "$name$it" } }) {
                    log.i("Deleting stale font file: $fileName")
                    file.delete()
                }
            }
        }

        CoroutineScope(Dispatchers.IO).launch {
            fontDef.main.entries.map { (name, url) ->
                async {
                    try {
                        if (!isSafeFontName(name)) {
                            log.w("Not downloading a font of $setName: its name can't be saved as a file")
                            return@async
                        }
                        // A font file goes to the system's font parser: only from where nobody on the way can change
                        // it, as the bundle requires too (lib/addons/fonts)
                        if (!url.startsWith("https://")) {
                            log.w("Not downloading $name from $url: fonts are only downloaded over https")
                            return@async
                        }
                        val ext = FONT_FILE_EXTENSIONS.firstOrNull { url.endsWith(it) } ?: ".ttf"
                        val file = File(setDir, "$name$ext").apply { ensureFile() }
                        // Usually there already: the bundle downloads a font's files when it's installed
                        if (file.isFile && file.length() > 0) return@async
                        log.i("Downloading $name from $url")
                        // Read whole and within the cap, then put in place in one step, so a font cut off leaves no file
                        val part = File(setDir, ".$name$ext.part")
                        httpClient.prepareGet(url).execute { response ->
                            if (response.status == HttpStatusCode.OK) {
                                part.writeBytes(response.bodyCapped(DownloadLimits.FONT, url))
                                if (!part.renameTo(file)) {
                                    file.writeBytes(part.readBytes())
                                    part.delete()
                                }
                            } else {
                                log.w("Couldn't download $name: ${response.status}")
                            }
                        }
                    } catch (e: Throwable) {
                        log.e("Failed to download font ($name from $url)", e)
                    }
                }
            }.awaitAll()
        }
    }
}

/**
 * React Native's `createAssetTypeface(String, int, AssetManager): Typeface`: by name where Discord keeps it, and by its
 * signature and the font folder it reads where R8 renamed it (Discord 353.11 has it as `vf.a.a`)
 */
private fun findCreateAssetTypeface(classLoader: ClassLoader): Method? {
    val named = sequenceOf(
        $$"com.facebook.react.common.assets.ReactFontManager$Companion",
        $$"com.facebook.react.views.text.ReactFontManager$Companion",
    ).mapNotNull { classLoader.loadClassOrNull(it) }
        .firstNotNullOfOrNull {
            runCatching {
                it.method("createAssetTypeface", String::class.java, Int::class.java, AssetManager::class.java)
            }.getOrNull()
        }
    if (named != null) return named

    return DexFinder.findMethod {
        matcher {
            paramTypes("java.lang.String", "int", "android.content.res.AssetManager")
            returnType("android.graphics.Typeface")
            usingEqStrings("fonts/")
        }
    }
}

/**
 * Holds the per-process font-state used by the `createAssetTypeface` hijack. Mirrors the static
 * fields of the old `FontsModule`.
 */
private object FontsState {
    val FILE_EXTENSIONS = FONT_FILE_EXTENSIONS
    const val FONTS_ASSET_PATH = "fonts/"

    @Volatile
    var fontsDownloadsDir: File? = null

    @Volatile
    var fontsAbsPath: String? = null

    /** Whether [rawName] names a font the user picked, which is drawn here rather than by Discord */
    fun hasCustomFont(rawName: String, style: Int): Boolean =
        namesCustomFont(rawName, style, fontsDownloadsDir, fontsAbsPath?.let(::File))

    private val noted = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()

    @Volatile
    var log: Logger? = null

    /** The first lookups of each family and style, in the log: what a font that doesn't show is to be checked with */
    fun noteLookup(log: Logger, rawName: String, style: Int, custom: Boolean) {
        if (noted.size >= 24 || !noted.add("$rawName/$style")) return
        log.i("Font $rawName ($style): ${if (custom) "the picked font" else "Discord's"}")
    }

    private fun customFile(name: String, style: Int) =
        customFontFile(name, style, fontsDownloadsDir, fontsAbsPath?.let(::File))

    /** One of Discord's own font files, named as Discord names it for the style */
    private fun assetFont(assetManager: AssetManager, name: String, style: Int): Font? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
        val styled = discordStyledName(name, style)
        for (ext in FILE_EXTENSIONS) {
            try {
                return Font.Builder(assetManager, "$FONTS_ASSET_PATH$styled$ext").build()
            } catch (_: IOException) {
            } catch (_: RuntimeException) {
            }
        }
        return null
    }

    /**
     * The typeface for a family list with a picked font in it: each family in order, the picked font's file where it
     * has one and Discord's own otherwise, as Discord's lookup chains them. Null leaves it to Discord's lookup.
     */
    fun createAssetTypeface(rawName: String, style: Int, assetManager: AssetManager): Typeface? {
        val names = familyNames(rawName)
        if (names.isEmpty()) return null
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            // Without chained fallbacks: the first family the picked font has a file for
            for (name in names) customFile(name, style)?.let { return Typeface.createFromFile(it) }
            return null
        }
        val families = names.mapNotNull { name ->
            val font = customFile(name, style)?.let { file ->
                runCatching { Font.Builder(file).build() }
                    .onFailure { log?.w("The picked font's ${file.name} (${file.length()} bytes) couldn't be read: $it") }
                    .getOrNull()
            } ?: assetFont(assetManager, name, style)
            font?.let { FontFamily.Builder(it).build() }
        }
        if (families.isEmpty()) return null
        val builder = CustomFallbackBuilder(families[0])
        for (i in 1 until families.size) builder.addCustomFallback(families[i])
        return builder.build()
    }
}
