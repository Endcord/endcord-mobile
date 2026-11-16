@file:Suppress("DEPRECATION")

package io.github.revenge.xposed.tweaks.legacy.appearance

import android.content.Context
import android.content.res.Resources
import androidx.core.graphics.toColorInt
import io.github.revenge.Logger
import io.github.revenge.xposed.*
import io.github.revenge.xposed.tweaks.legacy.RevengePayloadBuilder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.put
import java.io.File

/**
 * The theme the bundle saved for the next start (`{ id, selected, data }`, lib/addons/themes in the bundle).
 *
 * [json] is handed back to the bundle as it was saved, every key of it, as the iOS loader does: the bundle compares it
 * with its own copy to tell whether the colors Discord started with are already the theme's, and draws the background.
 * The colors used here are read one by one: one this loader can't use (a theme may give `false` for "none", and the
 * bundle saves a color it couldn't read that way) is skipped, never the whole theme, which would leave it unselected.
 */
class StoredTheme(
    val json: JsonObject,
    /** Per key, the dark and the light color; null where the theme has none */
    val semanticColors: Map<String, List<String?>>,
    val rawColors: Map<String, String>,
)

private fun JsonElement?.stringOrNull() = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

/** The stored theme, or null for none: no theme is saved as {} */
fun readStoredTheme(text: String): StoredTheme? {
    val root = runCatching { RevengeJson.parseToJsonElement(text) }.getOrNull() as? JsonObject ?: return null
    if (root["id"].stringOrNull().isNullOrEmpty()) return null
    val data = root["data"] as? JsonObject ?: return null
    val semanticColors = (data["semanticColors"] as? JsonObject).orEmpty().mapNotNull { (key, values) ->
        (values as? JsonArray)?.let { key to it.map { value -> value.stringOrNull() } }
    }.toMap()
    val rawColors = (data["rawColors"] as? JsonObject).orEmpty().mapNotNull { (key, value) ->
        value.stringOrNull()?.let { key to it }
    }.toMap()
    return StoredTheme(root, semanticColors, rawColors)
}

/**
 * Patches Discord's [com.discord.theme.DarkerTheme] / [LightTheme] getters and
 * `ColorUtilsKt.getColorCompat` overloads with values read from `files/pyoncord/current-theme.json`.
 */
val themes by tweak {
    val log: Logger = this.log
    val themeFile = File(
        appInfo.dataDir,
        "${RevengeConstants.FILES_DIR}/current-theme.json",
    ).apply { ensureFile() }

    val text = runCatching { themeFile.readText() }.getOrDefault("")
    val loaded: StoredTheme? = if (text.isNotBlank() && text != "{}" && text != "null") {
        readStoredTheme(text).also { if (it == null) log.w("current-theme.json isn't a theme") }
    } else null

    RevengePayloadBuilder.contribute {
        put("hasThemeSupport", true)
        put("storedTheme", loaded?.json ?: JsonNull)
    }

    val theme = loaded ?: return@tweak

    // A theme is data from anyone (a link in a message): a color it gets wrong is skipped, not the whole theme
    val rawColorMap = mutableMapOf<String, Int>()
    theme.rawColors.forEach { (k, v) ->
        parseThemeColor(v)?.let { rawColorMap[k.lowercase()] = it } ?: log.w("Skipping raw color $k: $v isn't a color")
    }

    // Discord's native color classes, which newer versions no longer have (353.11 draws every screen in React Native,
    // where the bundle applies the theme): only what's there is themed here, and nothing missing is an error
    val themeManager = classLoader.loadClassOrNull("com.discord.theme.utils.ColorUtilsKt")
    val darkTheme = classLoader.loadClassOrNull("com.discord.theme.DarkerTheme")
    val lightTheme = classLoader.loadClassOrNull("com.discord.theme.LightTheme")
    if (themeManager == null && darkTheme == null && lightTheme == null) {
        log.i("This Discord has no native color classes; the theme applies to its React Native screens")
        return@tweak
    }

    theme.semanticColors.forEach { (key, values) ->
        // TEXT_NORMAL -> getTextNormal
        val methodName = "get${key.fromScreamingSnakeToCamelCase()}"
        values.forEachIndexed { index, v ->
            val target = when (index) {
                0 -> darkTheme
                1 -> lightTheme
                else -> null
            } ?: return@forEachIndexed
            val color = v?.let(::parseThemeColor) ?: return@forEachIndexed
            // Only a color getter: the key names the method, and another one made to return an int would break
            // Discord, every time it starts
            val getter = runCatching { target.getDeclaredMethod(methodName) }.getOrNull()
            if (getter == null || getter.returnType != Int::class.javaPrimitiveType) {
                log.d("$methodName isn't a color of ${target.name}")
                return@forEachIndexed
            }
            getter.hook {
                before { result = color }
            }
        }
    }

    if (rawColorMap.isNotEmpty() && themeManager != null) {
        val getColorCompat = themeManager.method(
            "getColorCompat",
            Resources::class.java,
            Int::class.javaPrimitiveType,
            Resources.Theme::class.java,
        )
        val getColorCompatLegacy = themeManager.method(
            "getColorCompat",
            Context::class.java,
            Int::class.javaPrimitiveType,
        )

        val patch = methodHook {
            before {
                val arg0 = args[0]
                val resources = if (arg0 is Context) arg0.resources else (arg0 as Resources)
                val name = resources.getResourceEntryName(args[1] as Int)
                rawColorMap[name]?.let { result = it }
            }
        }
        getColorCompat.hook(patch.build())
        getColorCompatLegacy.hook(patch.build())
    }
}

private fun String.fromScreamingSnakeToCamelCase(): String =
    split("_").joinToString("") { it.lowercase().replaceFirstChar { c -> c.uppercase() } }

/** A theme's color (`#RRGGBBAA` or `#RRGGBB`, as the bundle normalizes them) as a color int, or null when it isn't one */
private fun parseThemeColor(hexString: String): Int? = runCatching {
    if (hexString.length == 9) {
        // RRGGBBAA -> AARRGGBB so parseColor() is happy
        val alpha = hexString.substring(7, 9)
        val rrggbb = hexString.substring(1, 7)
        "#$alpha$rrggbb".toColorInt()
    } else hexString.toColorInt()
}.getOrNull()
