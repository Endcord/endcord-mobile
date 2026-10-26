/*
 * This file is part of Endcord, an Android Discord client mod based on Aliucord.
 * Copyright (c) 2026 rootpoi and contributors
 * Licensed under the Open Software License version 3.0
 */

package com.aliucord.settings

import android.content.Context
import android.text.InputType
import android.view.View
import android.widget.TextView
import androidx.annotation.DrawableRes
import androidx.core.content.ContextCompat
import com.aliucord.Constants
import com.aliucord.Utils
import com.aliucord.coreplugins.plugindownloader.PluginFile
import com.aliucord.fragments.InputDialog
import com.aliucord.fragments.SettingsPage
import com.aliucord.i18n.I18n
import com.discord.stores.StoreInviteSettings
import com.discord.widgets.guilds.invite.WidgetGuildInvite
import com.lytefast.flexinput.R
import java.util.regex.Pattern

/**
 * The top of the Plugins page: Endcord Classic runs Endcord's built-in plugins and Aliucord's, and this is where
 * Aliucord's come from. Installing works the same way as in Aliucord: from the Aliucord server's #plugins-list,
 * or from a link to a plugin's .zip.
 */
internal object PluginSources {
    /** Invite code of the Aliucord server, home of the Aliucord plugin ecosystem */
    private const val ALIUCORD_INVITE = "EsNDvBaHVU"

    /** Endcord for the latest Discord, which runs Endcord's plugins but not Aliucord's */
    private val NEW_CLIENT = Constants.ENDCORD_GITHUB_REPO + "/tree/next"

    // https://github.com/user/repo/blob/branch/Plugin.zip is GitHub's page for the file, not the file
    private val githubBlob = Pattern.compile("""^https://github\.com/([^/\s]+)/([^/\s]+)/blob/(\S+\.zip)$""")
    private val zipLink = Pattern.compile("""^https://\S+/([A-Za-z0-9_.\-]+)\.zip(?:[?#]\S*)?$""")

    @JvmStatic
    fun addTo(page: SettingsPage, onInstalled: Runnable) {
        val ctx = page.context ?: return

        page.addHeader(ctx, I18n.t("Aliucord Plugins"))
        TextView(ctx, null, 0, R.i.UiKit_Settings_Item_Addition).run {
            text = I18n.t("Endcord Classic runs Endcord's built-in plugins and Aliucord plugins. To install an Aliucord plugin, long-press its link in the #plugins-list channel of the Aliucord server and choose Install, or install it from a link.")
            page.addView(this)
        }
        page.addView(link(ctx, I18n.t("Open the Aliucord Server"), R.e.ic_open_in_new_white_24dp) {
            WidgetGuildInvite.Companion!!.launch(it.context, StoreInviteSettings.InviteCode(ALIUCORD_INVITE, "", null))
        })
        page.addView(link(ctx, I18n.t("Install a Plugin from a Link"), R.e.ic_file_download_white_24dp) {
            promptForLink(page, onInstalled)
        })
        page.addView(link(ctx, I18n.t("Endcord for the latest Discord"), R.e.ic_account_github_white_24dp) {
            Utils.launchUrl(NEW_CLIENT)
        })
        page.addDivider(ctx)
    }

    private fun link(ctx: Context, text: String, @DrawableRes icon: Int, onClick: View.OnClickListener) =
        TextView(ctx, null, 0, R.i.UiKit_Settings_Item_Icon).apply {
            this.text = text
            val start = ContextCompat.getDrawable(ctx, icon)?.mutate()?.also { Utils.tintToTheme(it) }
            setCompoundDrawablesRelativeWithIntrinsicBounds(start, null, null, null)
            setOnClickListener(onClick)
        }

    private fun promptForLink(page: SettingsPage, onInstalled: Runnable) {
        val dialog = InputDialog()
            .setTitle(I18n.t("Install a Plugin from a Link"))
            .setDescription(I18n.t("Paste a link to the plugin's .zip file, like https://github.com/user/repo/raw/builds/Plugin.zip. Only install plugins from people you trust: they can do anything Discord can."))
            .setPlaceholderText("https://")
            .setInputType(InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI)
        dialog.setOnOkListener {
            val target = parse(dialog.input.trim())
            if (target == null) {
                Utils.showToast(I18n.t("That isn't a link to a plugin's .zip file"))
                return@setOnOkListener
            }
            dialog.dismiss()
            PluginFile(target.name).install(target.url, onInstalled)
        }
        dialog.show(page.parentFragmentManager, "Install Plugin")
    }

    // Not kotlin.Pair: Discord's jar ships a stripped copy of it
    private class Target(val url: String, val name: String)

    /** The download link and the plugin's name, or null when the text isn't a plugin link */
    private fun parse(text: String): Target? {
        var url = text
        val blob = githubBlob.matcher(url)
        if (blob.matches()) url = "https://github.com/${blob.group(1)}/${blob.group(2)}/raw/${blob.group(3)}"
        val zip = zipLink.matcher(url)
        if (!zip.matches()) return null
        return Target(url, zip.group(1)!!)
    }
}
