package io.github.revenge.xposed.tweaks

import java.io.File

/**
 * SHA-256 of every file Endcord itself ever puts in the preloads folder: React DevTools 7.0.1, pinned as RDT_SHA256 in
 * bundle/src/core/ui/settings/pages/Developer/index.tsx. Change both together.
 */
internal val PRELOAD_ALLOWLIST: Set<String> = setOf(
    "63ed06bb1a1b6d023f9b98fe0897aa5817045bba0950bef20604918d82b7f18b",
)

internal class PreloadPlan(val run: List<File>, val refused: List<File>)

/**
 * Which files of the preloads folder run before the bundle, on every start. A plugin can write that folder (Discord's
 * file module reaches it), and a file there would keep running after the plugin is removed and in safe mode: so in an
 * app that isn't a developer's own build ([debuggable]), only a file whose SHA-256 ([sha256Of], null when it can't be
 * read) is in the [allowlist] runs. In a debuggable one, all of them do, as before.
 */
internal fun planPreloads(
    files: List<File>,
    debuggable: Boolean,
    sha256Of: (File) -> String?,
    allowlist: Set<String> = PRELOAD_ALLOWLIST,
): PreloadPlan {
    if (debuggable) return PreloadPlan(files, emptyList())
    val (run, refused) = files.partition { file -> sha256Of(file)?.lowercase()?.let { it in allowlist } == true }
    return PreloadPlan(run, refused)
}

/** What ran from the preloads folder in this start, for Endcord's security page */
internal object PreloadStatus {
    @Volatile
    var ran = 0

    @Volatile
    var refused = 0
}
