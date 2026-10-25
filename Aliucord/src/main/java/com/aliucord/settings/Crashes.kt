/*
 * This file is part of Endcord, an Android Discord client mod based on Aliucord.
 * Copyright (c) 2021 Juby210 & Vendicated
 * Licensed under the Open Software License version 3.0
 */
package com.aliucord.settings

import android.text.SpannableStringBuilder
import android.view.Gravity
import android.view.View
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.core.content.res.ResourcesCompat
import com.aliucord.Constants
import com.aliucord.Utils
import com.aliucord.fragments.SettingsPage
import com.aliucord.i18n.I18n
import com.aliucord.utils.DimenUtils
import com.aliucord.utils.MDUtils
import com.lytefast.flexinput.R
import java.io.File
import java.util.*


private data class CrashLog(val timestamp: String, val stacktrace: String, var times: Int)

class Crashes : SettingsPage() {
    override fun onViewBound(view: View) {
        super.onViewBound(view)
        setActionBarTitle(I18n.t("Crash Logs"))

        val context = view.context
        val padding = DimenUtils.defaultPadding
        val p = padding / 2

        val dir = File(Constants.CRASHLOGS_PATH)
        val files = dir.listFiles()
        val hasCrashes = files != null && files.isNotEmpty()

        addHeaderButton(I18n.t("Open Crashlog Folder"), R.e.ic_open_in_new_white_24dp) {
            if (!dir.exists() && !dir.mkdir()) {
                Utils.showToast(I18n.t("Failed to create crashlogs directory!"), true)
            } else {
                Utils.launchFileExplorer(dir)
            }
            true
        }
        headerBar.menu.add(I18n.t("Clear Crashes"))
            .setIcon(ContextCompat.getDrawable(context, R.e.ic_delete_24dp))
            .setEnabled(hasCrashes)
            .setOnMenuItemClickListener {
                files?.forEach { it.delete() }
                reRender()
                true
            }


        val crashes = getCrashes()
        if (crashes == null || crashes.isEmpty()) {
            TextView(context, null, 0, R.i.UiKit_Settings_Item_Header).run {
                isAllCaps = false
                text = I18n.t("No crashes so far")
                typeface = ResourcesCompat.getFont(context, Constants.Fonts.whitney_semibold)
                gravity = Gravity.CENTER
                setPadding(p, p, p, p)

                linearLayout.addView(this)
            }
        } else {
            TextView(context, null, 0, R.i.UiKit_Settings_Item_SubText).run {
                text = I18n.t("Hint: Crash logs are also in your file manager, in the Endcord/crashlogs folder. Tap a log to copy it.")
                typeface = ResourcesCompat.getFont(context, Constants.Fonts.whitney_medium)
                gravity = Gravity.CENTER
                linearLayout.addView(this)
            }
            crashes.values.forEach { (timestamp, stacktrace, times) ->
                TextView(context, null, 0, R.i.UiKit_Settings_Item_Header).run {
                    var title = timestamp
                    if (times > 1)
                        title += " ($times)"
                    text = title
                    typeface = ResourcesCompat.getFont(context, Constants.Fonts.whitney_semibold)
                    linearLayout.addView(this)
                }
                TextView(context).run {
                    text = MDUtils.renderCodeBlock(context, SpannableStringBuilder(), null, stacktrace)
                    setOnClickListener {
                        Utils.setClipboard("CrashLog-$timestamp", stacktrace)
                        Utils.showToast(I18n.t("Copied to clipboard"))
                    }
                    linearLayout.addView(this)
                }
            }
        }
    }

    private fun getCrashes(): Map<Int, CrashLog>? {
        val folder = File(Constants.CRASHLOGS_PATH)
        val files = folder.listFiles()?.apply {
            sortByDescending { it.lastModified() }
        } ?: return null

        val res = LinkedHashMap<Int, CrashLog>()
        for (file in files) {
            if (!file.isFile) continue
            val content = file.readText()
            val hashCode = content.hashCode()
            res.computeIfAbsent(hashCode) {
                CrashLog(
                    timestamp = file.name.replace(".txt", "").replace("_".toRegex(), ":"),
                    stacktrace = content,
                    times = 0
                )
            }.times++
        }
        return res
    }
}
