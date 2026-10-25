/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.commandscommon

import android.content.Context
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import com.aliucord.Utils
import com.aliucord.i18n.I18n

/** Plain dialogs styled by the app theme, for showing results of message actions. */
internal object Dialogs {
    /**
     * Shows [text] with a button that copies [copyText] (defaults to [text]). The text can be selected.
     * Must be called on the main thread with an activity context.
     */
    @JvmStatic
    fun showText(context: Context, title: CharSequence, text: CharSequence, copyText: CharSequence = text) {
        val dialog = AlertDialog.Builder(context)
            .setTitle(title)
            .setMessage(text)
            .setPositiveButton(I18n.t("Copy")) { _, _ -> copy(copyText) }
            .setNegativeButton(I18n.t("Close"), null)
            .show()
        dialog.findViewById<TextView>(android.R.id.message)?.setTextIsSelectable(true)
    }

    /** Shows a list of [items]; tapping one calls [onClick] with its index. */
    @JvmStatic
    fun showList(context: Context, title: CharSequence, items: List<CharSequence>, onClick: (Int) -> Unit) {
        AlertDialog.Builder(context)
            .setTitle(title)
            .setItems(items.toTypedArray()) { _, which -> onClick(which) }
            .setNegativeButton(I18n.t("Close"), null)
            .show()
    }

    /** Copies [text] to the clipboard and confirms it with a toast. */
    @JvmStatic
    fun copy(text: CharSequence) {
        Utils.setClipboard("Endcord", text)
        Utils.showToast(I18n.t("Copied to clipboard"))
    }
}
