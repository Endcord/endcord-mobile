package io.github.revenge.xposed.tweaks.plugins.internal

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.widget.Toast
import io.github.revenge.plugins.API_VERSION
import io.github.revenge.plugins.PluginManifest
import io.github.revenge.plugins.PluginScope
import io.github.revenge.reloadApp
import io.github.revenge.xposed.*
import io.github.revenge.xposed.api.registerNativeMethod
import io.github.revenge.xposed.tweaks.RevengeUpdater
import io.github.revenge.xposed.tweaks.base.withAppActivity
import io.github.revenge.xposed.tweaks.crashRecoveryTriggered
import io.github.revenge.xposed.tweaks.plugins.PluginStatesStore
import io.github.revenge.xposed.tweaks.resetCrashCount
import java.io.File

private val manifest = PluginManifest(
    id = "revenge.recovery",
    name = "Recovery",
    description = "Handles errors and provides troubleshooting options for Endcord.",
    author = "Revenge",
    icon = "ShieldIcon",
    version = API_VERSION,
)

internal val recoveryPlugin =
    internalPlugin(manifest, setOf(InternalPluginFlags.INTERNAL, InternalPluginFlags.ESSENTIAL)) {
        start {
            // User stuck in Recovery mode. It is only ever intended to be one-shot.
            if (PluginStatesStore.activeSlotId == PluginStatesStore.DEFAULTS_SLOT) {
                PluginStatesStore.setActiveSlot(appInfo.dataDir, PluginStatesStore.PRIMARY_SLOT, false)
            }

            addBridgeMethods()
            recoveryHook()
        }
    }

/**
 * For the actual shake-gesture hook, you should be looking at [io.github.revenge.xposed.tweaks.discordDevSupport].
 */
fun showRecoveryAlert(context: Context) {
    AlertDialog.Builder(context)
        .setTitle(Strings["recovery_title"])
        .setItems(
            arrayOf(Strings["recovery_reload"], Strings["recovery_enter"], Strings["recovery_delete_script"], Strings["recovery_reset_config"]),
        ) { _, which ->
            when (which) {
                0 -> reloadApp()

                1 -> {
                    PluginStatesStore.setActiveSlot(
                        context.dataDir.absolutePath,
                        PluginStatesStore.DEFAULTS_SLOT,
                        oneShot = true,
                    )
                    reloadApp()
                }

                2 -> {
                    val bundleFile = File(
                        context.dataDir,
                        "${RevengeConstants.CACHE_DIR}/${RevengeConstants.MAIN_SCRIPT_FILE}",
                    )
                    if (bundleFile.exists()) bundleFile.delete()
                    reloadApp()
                }

                3 -> {
                    RevengeUpdater.resetLoaderConfig()
                    reloadApp()
                }
            }
        }
        .show()
}

fun PluginScope.addBridgeMethods() {
    withAppActivity { act ->
        registerNativeMethod("revenge.showRecoveryAlert") {
            showRecoveryAlert(act)
            null
        }

        registerNativeMethod("revenge.alertError") {
            val (error, version) = it
            val errorString = "$error"

            val clipboard = act.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("Stack Trace", errorString)

            AlertDialog.Builder(act)
                .setTitle(Strings["error_title"])
                .setMessage(
                    """
                        Endcord: $version
                        Discord: ${act.versionName()} (${act.versionCode()})
                        Device: ${Build.MANUFACTURER} ${Build.MODEL}
                        
                        
                    """.trimIndent() + errorString
                )
                .setPositiveButton(android.R.string.ok) { dialog, _ -> dialog.dismiss() }
                .setNeutralButton(android.R.string.copy) { dialog, _ ->
                    @Suppress("UsePropertyAccessSyntax")
                    clipboard.setPrimaryClip(clip)
                    Toast.makeText(act, Strings["copied_stack_trace"], Toast.LENGTH_SHORT).show()
                    dialog.dismiss()
                }
                .setNegativeButton(Strings["recovery"]) { dialog, _ ->
                    showRecoveryAlert(act)
                    dialog.dismiss()
                }
                .show()

            null
        }
    }
}

fun recoveryHook() {
    var holdRunnable: Runnable? = null
    var hintRunnable: Runnable? = null
    val handler = Handler(Looper.getMainLooper())

    withAppActivity {
        if (crashRecoveryTriggered) {
            AlertDialog.Builder(it)
                .setTitle(Strings["recovery_booted_title"])
                .setMessage(Strings["recovery_booted_message"])
                .setPositiveButton(android.R.string.ok) { d, _ -> d.dismiss() }
                .setNeutralButton(Strings["recovery_exit"]) { _, _ -> reloadApp() }
                .show()
        }

        val hook = Activity::class.java.method("dispatchTouchEvent", MotionEvent::class.java).hook {
            before {
                val event = param.args[0] as MotionEvent
                val activity = param.thisObject as Activity

                if (event.pointerCount == 2) {
                    when (event.actionMasked) {
                        // 3s hold timer when 2nd finger touches screen
                        MotionEvent.ACTION_POINTER_DOWN -> {
                            hintRunnable = Runnable {
                                Toast.makeText(activity, Strings["recovery_hold"], Toast.LENGTH_SHORT).show()
                            }.also { handler.postDelayed(it, 1500) }

                            holdRunnable = Runnable { showRecoveryAlert(activity) }.also { handler.postDelayed(it, 3000) }
                        }

                        // Lifted finger early
                        MotionEvent.ACTION_POINTER_UP, MotionEvent.ACTION_CANCEL -> {
                            hintRunnable?.let { handler.removeCallbacks(it) }
                            holdRunnable?.let { handler.removeCallbacks(it) }
                        }
                    }
                }
            }
        }

        // Stop listening after 3s
        handler.postDelayed({
            hook.unhook()

            // Give users up to 2 extra seconds (5 - 3) to press the dialog options
            handler.postDelayed({
                resetCrashCount()
            }, 5000)
        }, 3000)

        // Intentional exit, so we clear the crash count
        Activity::class.java.method("onDestroy").hook {
            before {
                val activity = param.thisObject as Activity
                if (activity.isFinishing) resetCrashCount()
            }
        }
    }
}
