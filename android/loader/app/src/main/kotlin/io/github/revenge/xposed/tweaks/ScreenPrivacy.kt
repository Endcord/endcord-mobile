package io.github.revenge.xposed.tweaks

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import io.github.revenge.xposed.RevengeConstants
import io.github.revenge.xposed.api.registerNativeMethod
import io.github.revenge.xposed.hook
import io.github.revenge.xposed.method
import io.github.revenge.xposed.tweak
import java.io.File
import java.util.Collections
import java.util.WeakHashMap
import java.util.concurrent.atomic.AtomicReference

/**
 * How much of Discord is kept off other people's eyes, for Endcord's PrivacyCurtain plugin (Endcord PC's, for a phone):
 * nothing; the preview of the app in the recent apps screen; or that and every screenshot and screen recording.
 */
internal enum class ScreenPrivacy(val key: String) {
    OFF("off"),
    RECENTS("recents"),
    ALL("all");

    companion object {
        /** The saved or asked-for mode: anything that isn't one is off */
        fun of(text: String?): ScreenPrivacy = entries.firstOrNull { it.key == text?.trim() } ?: OFF
    }
}

/**
 * The window's flag and whether the app switcher may show the app, for a mode on an Android version: Android 13 has a
 * switch for the preview alone, so screenshots still work there; before it, hiding the preview takes the secure flag,
 * which also blocks screenshots.
 */
internal fun screenPrivacyEffect(mode: ScreenPrivacy, sdk: Int): Pair<Boolean, Boolean> = when (mode) {
    ScreenPrivacy.OFF -> false to true
    ScreenPrivacy.RECENTS -> (sdk < Build.VERSION_CODES.TIRAMISU) to false
    ScreenPrivacy.ALL -> true to false
}

val screenPrivacy by tweak {
    // Read before the first window, so the app switcher never gets a preview of a start with the curtain on
    val current = AtomicReference(ScreenPrivacy.OFF)
    val saved = AtomicReference<File?>(null)
    val activities: MutableSet<Activity> = Collections.synchronizedSet(Collections.newSetFromMap(WeakHashMap()))

    fun apply(activity: Activity) {
        val (secure, previews) = screenPrivacyEffect(current.get(), Build.VERSION.SDK_INT)
        activity.runOnUiThread {
            runCatching {
                if (secure) activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) activity.setRecentsScreenshotEnabled(previews)
            }.onFailure { log.w("Couldn't set the screen privacy of ${activity.javaClass.name}: $it") }
        }
    }

    withAppContext { ctx ->
        val file = File(ctx.dataDir, "${RevengeConstants.FILES_DIR}/screen-privacy")
        saved.set(file)
        current.set(ScreenPrivacy.of(runCatching { file.takeIf { it.isFile }?.readText() }.getOrNull()))
        if (current.get() != ScreenPrivacy.OFF) log.i("Screen privacy: ${current.get().key}")
    }

    // Every window of the app: Discord's own and any it opens later
    Activity::class.java.method("onCreate", Bundle::class.java).hook {
        after {
            val activity = thisObject as? Activity ?: return@after
            activities.add(activity)
            if (current.get() != ScreenPrivacy.OFF) apply(activity)
        }
    }

    registerNativeMethod("endcord.screenPrivacy.get") {
        mapOf("mode" to current.get().key, "recentsAlone" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU))
    }

    registerNativeMethod("endcord.screenPrivacy.set") { args ->
        val mode = ScreenPrivacy.of(args.firstOrNull() as? String)
        current.set(mode)
        runCatching {
            val target = saved.get() ?: return@runCatching
            if (mode == ScreenPrivacy.OFF) target.delete() else target.writeText(mode.key)
        }.onFailure { log.w("Couldn't save the screen privacy: $it") }
        synchronized(activities) { activities.toList() }.forEach(::apply)
        mode.key
    }
}
