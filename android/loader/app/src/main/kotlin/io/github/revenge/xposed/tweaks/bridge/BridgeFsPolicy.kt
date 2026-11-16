package io.github.revenge.xposed.tweaks.bridge

import java.io.File
import java.util.Locale

/** What a `revenge.fs.*` call does with its path */
internal enum class BridgeFsAccess {
    /** `read`, `exists` */
    READ,

    /** `write`, `delete` */
    WRITE,
}

/**
 * Where the `revenge.fs.*` bridge may reach. Any JavaScript in Discord can call it, plugins included, so:
 *
 * - every call stays inside the app's files or cache folder ([roots]);
 * - writes and deletes never touch what the loader itself trusts ([protectedPaths]): a file there would make the loader
 *   run a plugin's code on every start, even once the plugin is removed and in safe mode. Neither a protected path, nor
 *   anything inside it, nor a folder holding one (deleting it would take the protected path along), nor a file beside
 *   one named after it (`loader.json.bak`, `.tmp`, `.new`: the loader puts an AtomicFile's `.bak` back over its file).
 *
 * Paths are compared as canonical paths, so `..`, `.`, repeated separators and symlinks can't lead out, and the protected
 * ones without regard to case. A refusal throws a [SecurityException] saying why, which the bridge returns as its error.
 */
internal class BridgeFsPolicy(roots: List<File>, protectedPaths: List<File>) {
    private val roots = roots.map { it.canonicalFile }
    private val protectedPaths = protectedPaths.map { it.canonicalFile }

    /** The canonical file [path] names, to do [access] on; throws when it may not */
    fun check(path: String, access: BridgeFsAccess): File {
        val given = File(path)
        if (path.isEmpty() || !given.isAbsolute) throw SecurityException("Not an absolute path: '$path'")
        val target = given.canonicalFile
        if (roots.none { target.isSameOrInside(it) }) {
            throw SecurityException("'$path' isn't inside the app's files or cache folder")
        }
        if (access == BridgeFsAccess.WRITE) {
            protectedPaths.firstOrNull { touches(target, it) }?.let {
                throw SecurityException("'$path' is kept by Endcord's loader, which alone may write or delete it (${it.name})")
            }
        }
        return target
    }

    private fun File.isSameOrInside(dir: File) = path == dir.path || path.startsWith(dir.path + File.separator)

    private fun touches(target: File, protected: File): Boolean {
        val t = target.path.lowercase(Locale.ROOT)
        val p = protected.path.lowercase(Locale.ROOT)
        if (t == p || t.startsWith(p + File.separator) || p.startsWith(t + File.separator)) return true
        // Beside it, named after it
        return t.startsWith("$p.") && !t.substring(p.length).contains(File.separatorChar)
    }
}

/**
 * LSPatch's own folder in the app's cache: it keeps the original app (cache/lspatch/origin) and the modules it loads
 * there, so a file written there is code the app runs.
 */
internal const val LSPATCH_CACHE_DIR = "lspatch"
