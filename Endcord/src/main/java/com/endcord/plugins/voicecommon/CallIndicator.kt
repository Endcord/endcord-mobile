/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.voicecommon

import android.widget.TextView
import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.api.PatcherAPI
import com.aliucord.patcher.after
import com.aliucord.utils.ViewUtils.findViewById
import com.discord.widgets.status.WidgetGlobalStatusIndicator
import com.discord.widgets.status.WidgetGlobalStatusIndicatorViewModel
import java.lang.ref.WeakReference
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Extra text after "Voice Connected: …" in the bar shown at the top while you are in a call (Discord's
 * `WidgetGlobalStatusIndicator`). Plugins add a [register]ed provider; providers that change over time (a timer)
 * pass `ticking = true` and the text is refreshed every second while the bar is shown. Owners must call
 * [unregisterAll] when they stop.
 */
internal object CallIndicator {
    private class Provider(val owner: String, val ticking: Boolean, val text: () -> String?)

    private val logger = Logger("CallIndicator")
    private val providers = CopyOnWriteArrayList<Provider>()
    private var patched = false

    /** The indicator text view and the text Discord put there, without our suffix. */
    private var target: WeakReference<TextView>? = null
    private var baseText: CharSequence? = null
    private var ticking = false

    private const val SEPARATOR = "  •  "

    fun register(owner: String, ticking: Boolean = false, text: () -> String?) {
        providers += Provider(owner, ticking, text)
        ensurePatched()
        Utils.mainThread.post { refresh() }
    }

    fun unregisterAll(owner: String) {
        providers.removeAll { it.owner == owner }
        Utils.mainThread.post { refresh() }
    }

    /** Re-renders the suffix now, for example after a fake mute was toggled. Main thread. */
    fun refresh() {
        val view = target?.get() ?: return
        val base = baseText ?: return
        // Discord reuses the view for other states (connecting, offline, stage); leave those alone
        if (!view.text.toString().startsWith(base.toString())) {
            target = null
            baseText = null
            return
        }
        try {
            val parts = ArrayList<String>(providers.size)
            for (provider in providers) {
                val part = try {
                    provider.text()
                } catch (e: Throwable) {
                    logger.error("${provider.owner}: indicator text failed", e)
                    null
                }
                if (!part.isNullOrEmpty()) parts += part
            }
            view.text = if (parts.isEmpty()) base else "$base$SEPARATOR${parts.joinToString(SEPARATOR)}"
            scheduleTick()
        } catch (e: Throwable) {
            logger.error("Failed to update the call indicator", e)
        }
    }

    private val tick = Runnable {
        ticking = false
        val view = target?.get()
        if (view != null && view.isAttachedToWindow && view.isShown) refresh()
    }

    private fun scheduleTick() {
        if (ticking || providers.none { it.ticking }) return
        ticking = true
        Utils.mainThread.postDelayed(tick, 1000L)
    }

    @Synchronized
    private fun ensurePatched() {
        if (patched) return
        patched = true
        PatcherAPI(logger).after<WidgetGlobalStatusIndicator>(
            "setupIndicatorStatus",
            WidgetGlobalStatusIndicatorViewModel.ViewState.CallOngoing::class.java,
        ) {
            try {
                val text = view?.findViewById<TextView?>("indicator_text") ?: return@after
                target = WeakReference(text)
                baseText = text.text
                if (providers.isNotEmpty()) refresh()
            } catch (e: Throwable) {
                logger.error("Failed to decorate the call indicator", e)
            }
        }
    }
}
