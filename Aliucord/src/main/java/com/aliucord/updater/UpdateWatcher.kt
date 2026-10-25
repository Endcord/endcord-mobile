/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.aliucord.updater

import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.patcher.Hook
import com.aliucord.patcher.Patcher
import com.discord.app.AppActivity

/**
 * Checks the Endcord GitHub repository for a new build every 15 minutes while the app is running, and again when
 * the app comes back to the foreground after the interval passed (handler delays don't advance while the device
 * sleeps). Found updates surface as an in-app "Endcord updated" notification that updates with one tap.
 */
internal object UpdateWatcher {
    /** How often to look for updates. */
    const val INTERVAL_MS = 15 * 60 * 1000L

    private val logger = Logger("Updater/Watcher")
    private val tick = Runnable { runCheck() }

    @Volatile
    private var started = false

    /** When the last check was started, successful or not, so a flaky network doesn't cause a check on every resume. */
    @Volatile
    private var lastAttempt = 0L

    /** Starts watching. The startup check is done separately, so the first periodic check is one interval later. */
    @JvmStatic
    fun start() {
        if (started) return
        started = true
        lastAttempt = System.currentTimeMillis()

        try {
            Patcher.addPatch(AppActivity::class.java.getDeclaredMethod("onResume"), Hook {
                if (System.currentTimeMillis() - lastAttempt >= INTERVAL_MS) reschedule(0)
            })
        } catch (e: Throwable) {
            logger.error("Failed to hook AppActivity.onResume, updates are only checked on a timer", e)
        }
        reschedule()
    }

    /** Restarts the timer, for example after the updater was turned back on. */
    @JvmStatic
    @JvmOverloads
    fun reschedule(delayMs: Long = INTERVAL_MS) {
        if (!started) return
        Utils.mainThread.removeCallbacks(tick)
        if (!CoreUpdater.isUpdaterDisabled()) Utils.mainThread.postDelayed(tick, delayMs)
    }

    private fun runCheck() {
        lastAttempt = System.currentTimeMillis()
        Utils.threadPool.execute {
            try {
                CoreUpdater.checkForUpdates(silent = true)
            } catch (e: Throwable) {
                logger.error("Periodic update check failed", e)
            } finally {
                reschedule()
            }
        }
    }
}
