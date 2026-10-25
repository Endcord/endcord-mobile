/*
 * This file is part of Endcord, an Android Discord client mod based on Aliucord.
 * Licensed under the Open Software License version 3.0
 */

package com.aliucord.screens

import android.graphics.Color
import android.os.Bundle
import android.view.*
import android.widget.TextView
import android.widget.Toast
import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.fragments.SettingsPage
import com.aliucord.i18n.I18n
import com.aliucord.settings.AliucordPage
import com.aliucord.updater.*
import com.aliucord.utils.DimenUtils
import com.aliucord.utils.MDUtils
import com.aliucord.utils.ViewUtils.addTo
import com.aliucord.views.Button
import com.aliucord.widgets.UpdaterPluginCard
import com.google.android.material.snackbar.Snackbar
import com.lytefast.flexinput.R

internal class UpdaterScreen : SettingsPage() {
    private val logger = Logger("UpdaterScreen")
    private val updateSource = PluginUpdaterSource()
    private val updates = mutableListOf<PluginUpdater.PluginUpdate>()

    @Volatile
    private var coreStatus: CoreUpdater.CoreStatus? = null

    @Volatile
    private var coreError = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (!CoreUpdater.isUpdaterDisabled()) {
            setActionBarSubtitle(I18n.t("Checking for updates..."))
            refreshUpdates()
        }
    }

    override fun onViewBound(view: View) {
        val context = view.context

        super.onViewBound(view)
        setActionBarTitle(I18n.t("Updater"))
        linearLayout.removeAllViews()

        addHeaderButton(I18n.t("Refresh"), R.e.ic_refresh_white_a60_24dp) { item ->
            item.isEnabled = false
            setActionBarSubtitle(I18n.t("Checking for updates..."))
            refreshUpdates()
            true
        }

        addHeaderButton(I18n.t("Update All"), R.e.ic_file_download_white_24dp) { item ->
            item.isEnabled = false
            setActionBarSubtitle(I18n.t("Updating..."))
            updateAll()
            true
        }

        val noticeText = when {
            CoreUpdater.isUpdaterDisabled() -> I18n.t("All update checks have been manually disabled.")
            CoreUpdater.isCustomCoreLoaded() -> I18n.t("Core updates are disabled due to using a custom Endcord core.")
            else -> null
        }
        if (noticeText != null) {
            Snackbar.make(getLinearLayout(), noticeText, Snackbar.LENGTH_INDEFINITE)
                .setAction(I18n.t("Settings")) { Utils.openPage(it.context, AliucordPage::class.java) }
                .setBackgroundTint(context.getColor(android.R.color.holo_orange_light))
                .setTextColor(Color.BLACK)
                .setActionTextColor(Color.BLACK)
                .show()
        }

        addHeader(context, "Endcord")
        val status = coreStatus
        TextView(context, null, 0, R.i.UiKit_Settings_Item_SubText).addTo(linearLayout) {
            text = when {
                status == null && coreError -> I18n.t("Couldn't reach GitHub to check for Endcord updates.")
                status == null -> I18n.t("Checking for updates...")
                status.updateAvailable -> I18n.t("Version {latest} is available, you have {current}.", "latest" to status.latest, "current" to status.current)
                else -> I18n.t("Endcord {current} is up to date.", "current" to status.current)
            }
        }
        if (status != null && status.updateAvailable) {
            status.changelog?.trim()?.takeIf { it.isNotEmpty() }?.let { changelog ->
                TextView(context, null, 0, R.i.UiKit_Settings_Item_Addition).addTo(linearLayout) {
                    text = MDUtils.render(changelog)
                }
            }
            if (!status.compatible) {
                TextView(context, null, 0, R.i.UiKit_Settings_Item_Addition).addTo(linearLayout) {
                    text = I18n.t("This update needs a fresh install. Tap to reinstall Endcord with Endcord Installer.")
                }
            }
            Button(context).addTo(linearLayout) {
                text = if (status.compatible) I18n.t("Update and restart") else I18n.t("Open Endcord Installer")
                setOnClickListener {
                    isEnabled = false
                    CoreUpdater.updateNow(status)
                }
            }
        }

        addDivider(context)
        addHeader(context, I18n.t("Plugins"))
        if (updates.isEmpty()) {
            TextView(context, null, 0, R.i.UiKit_Settings_Item_SubText).addTo(linearLayout) {
                text = I18n.t("No plugin updates found!")
                setPadding(DimenUtils.defaultPadding)
                setGravity(Gravity.CENTER)
            }
        } else {
            for (update in updates) {
                UpdaterPluginCard(context, update, this::refreshUpdates).addTo(linearLayout)
            }
        }
    }

    /** Shows [text] and re-renders, unless the page was closed in the meantime. */
    private fun postResult(text: String?) {
        Utils.mainThread.post {
            val ctx = context ?: return@post
            if (!isAdded) return@post
            setActionBarSubtitle(null)
            if (text != null) Toast.makeText(ctx, text, Toast.LENGTH_SHORT).show()
            reRender()
        }
    }

    private fun refreshUpdates() {
        Utils.threadPool.execute {
            if (!CoreUpdater.isCustomCoreLoaded()) {
                try {
                    coreStatus = CoreUpdater.fetchCoreStatus()
                    coreError = false
                } catch (e: Exception) {
                    logger.warn("Failed to fetch core status: ${e.message}")
                    coreError = true
                }
            }

            val fetched = PluginUpdater.fetchUpdates(updateSource)
            Utils.mainThread.post {
                updates.clear()
                updates.addAll(fetched)
            }

            postResult(
                if (fetched.isNotEmpty()) I18n.t("Found {count} plugin updates!", "count" to fetched.size)
                else null
            )
        }
    }

    private fun updateAll() {
        val updates = updates.toList()
        if (updates.isEmpty()) {
            setActionBarSubtitle(null)
            Toast.makeText(requireContext(), I18n.t("No plugin updates found!"), Toast.LENGTH_LONG).show()
            return
        }

        Utils.threadPool.execute {
            val (succeeded, failed) = updates
                .filter { it.isUpdatePossible() }
                .partition(PluginUpdater::updatePlugin)

            postResult(
                if (failed.isEmpty()) I18n.t("Updated {count} plugins!", "count" to succeeded.size)
                else I18n.t("Updated {count} plugins, but {failed} failed!", "count" to succeeded.size, "failed" to failed.size)
            )
            refreshUpdates()
        }
    }
}
