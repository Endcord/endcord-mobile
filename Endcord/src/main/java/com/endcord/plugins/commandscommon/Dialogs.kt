/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.commandscommon

import android.app.Activity
import android.content.Context
import android.view.WindowManager
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.i18n.I18n

/** Plain dialogs styled by the app theme, for showing results of message actions. */
internal object Dialogs {
    private val logger = Logger("Endcord/Dialogs")

    /**
     * Shows [text] with a button that copies [copyText] (defaults to [text]). The text can be selected.
     * Must be called on the main thread with an activity context.
     */
    @JvmStatic
    fun showText(context: Context, title: CharSequence, text: CharSequence, copyText: CharSequence = text) {
        show(context) {
            val dialog = AlertDialog.Builder(context)
                .setTitle(title)
                .setMessage(text)
                .setPositiveButton(I18n.t("Copy")) { _, _ -> copy(copyText) }
                .setNegativeButton(I18n.t("Close"), null)
                .show()
            dialog.findViewById<TextView>(android.R.id.message)?.setTextIsSelectable(true)
        }
    }

    /** Shows a list of [items]; tapping one calls [onClick] with its index. */
    @JvmStatic
    fun showList(context: Context, title: CharSequence, items: List<CharSequence>, onClick: (Int) -> Unit) {
        show(context) {
            AlertDialog.Builder(context)
                .setTitle(title)
                .setItems(items.toTypedArray()) { _, which -> onClick(which) }
                .setNegativeButton(I18n.t("Close"), null)
                .show()
        }
    }

    /**
     * Callers often show a dialog after a network request, when the activity may have been closed or recreated
     * (rotation, theme change) in the meantime: showing it then would crash the app with BadTokenException.
     */
    private inline fun show(context: Context, block: () -> Unit) {
        val activity = context as? Activity
        if (activity != null && (activity.isFinishing || activity.isDestroyed)) return
        try {
            block()
        } catch (e: WindowManager.BadTokenException) {
            logger.warn("Dialog not shown, its window is gone: ${e.message}")
        }
    }

    /** Copies [text] to the clipboard and confirms it with a toast. */
    @JvmStatic
    fun copy(text: CharSequence) {
        Utils.setClipboard("Endcord", text)
        Utils.showToast(I18n.t("Copied!"))
    }
}
