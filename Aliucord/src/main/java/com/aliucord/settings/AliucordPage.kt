/*
 * This file is part of Endcord, an Android Discord client mod based on Aliucord.
 * Copyright (c) 2021 Juby210 & Vendicated
 * Licensed under the Open Software License version 3.0
 */

package com.aliucord.settings

import android.annotation.SuppressLint
import android.content.Context
import android.view.View
import android.widget.TextView
import androidx.annotation.DrawableRes
import androidx.core.content.ContextCompat
import com.aliucord.*
import com.aliucord.fragments.SelectDialog
import com.aliucord.fragments.SettingsPage
import com.aliucord.i18n.I18n
import com.aliucord.updater.UpdateWatcher
import com.discord.stores.StoreStream
import com.discord.views.CheckedSetting
import com.lytefast.flexinput.R

// These keys aren't consistent because they were originally part of different modules.
// They are kept as-is so settings carry over from older installs.
const val AUTO_DISABLE_ON_CRASH_KEY = "autoDisableCrashingPlugins"
const val AUTO_UPDATE_PLUGINS_KEY = "AC_plugins_auto_update_enabled"
const val AUTO_UPDATE_ALIUCORD_KEY = "AC_aliucord_auto_update_enabled"
const val ALIUCORD_SAFE_MODE_KEY = "AC_aliucord_safe_mode_enabled"
const val ALIUCORD_FROM_STORAGE_KEY = "AC_from_storage"
const val ALIUCORD_DISABLE_UPDATER = "disableAliucordUpdater"

/** Endcord's own settings page. */
class AliucordPage : SettingsPage() {
    @SuppressLint("SetTextI18n")
    override fun onViewBound(view: View) {
        super.onViewBound(view)

        setActionBarTitle("Endcord")
        setActionBarSubtitle(I18n.t("Endcord Settings"))

        val ctx = view.context

        addHeader(ctx, I18n.t("Language"))
        TextView(ctx, null, 0, R.i.UiKit_Settings_Item_SubText).run {
            text = I18n.t("Language") + "\n" + I18n.language.nativeName
            ContextCompat.getDrawable(ctx, R.e.ic_locale_24dp)?.mutate()?.let {
                Utils.tintToTheme(it)
                setCompoundDrawablesRelativeWithIntrinsicBounds(it, null, null, null)
                compoundDrawablePadding = com.aliucord.utils.DimenUtils.defaultPadding
            }
            setOnClickListener { pickLanguage() }
            linearLayout.addView(this)
        }
        TextView(ctx, null, 0, R.i.UiKit_Settings_Item_Addition).run {
            text = I18n.t("Select the display language for Endcord and Discord.")
            linearLayout.addView(this)
        }

        addDivider(ctx)
        addHeader(ctx, I18n.t("Updater"))
        addSwitch(
            ctx,
            AUTO_UPDATE_ALIUCORD_KEY,
            I18n.t("Automatically update Endcord"),
            I18n.t("Endcord checks for updates every 15 minutes. When this is on, updates are downloaded in the background and applied on the next restart."),
        )
        addSwitch(ctx, AUTO_UPDATE_PLUGINS_KEY, I18n.t("Automatically update plugins"), null)

        addDivider(ctx)
        addHeader(ctx, I18n.t("Plugins"))
        addSwitch(
            ctx,
            AUTO_DISABLE_ON_CRASH_KEY,
            I18n.t("Automatically disable plugins on crash"),
            I18n.t("When a plugin is found to be causing crashes, it will automatically be disabled"),
            true,
        )
        addSwitch(
            ctx,
            ALIUCORD_SAFE_MODE_KEY,
            I18n.t("Safe mode"),
            I18n.t("Disables all plugins and optional coreplugins."),
            false,
        ) { Utils.promptRestart() }

        addDivider(ctx)
        addHeader(ctx, I18n.t("Backup & Restore"))
        TextView(ctx, null, 0, R.i.UiKit_Settings_Item_Addition).run {
            text = I18n.t("Save the settings of Endcord and every plugin to the Endcord/backups folder, and restore them after reinstalling or on another device.")
            linearLayout.addView(this)
        }
        addLink(ctx, I18n.t("Export Settings"), R.e.ic_file_download_white_24dp, external = false) { BackupRestore.export() }
        addLink(ctx, I18n.t("Import Settings"), R.e.ic_history_white_24dp, external = false) { BackupRestore.pickAndImport(parentFragmentManager) }

        if (StoreStream.getUserSettings().isDeveloperMode) {
            addDivider(ctx)
            addHeader(ctx, I18n.t("Developer Settings"))
            addSwitch(
                ctx,
                ALIUCORD_FROM_STORAGE_KEY,
                I18n.t("Load custom Endcord core"),
                I18n.t("Meant for developers. Do not enable unless you know what you're doing. Loads a custom core bundle that was pushed to the device."),
            ) {
                Utils.promptRestart()
            }
            addSwitch(
                ctx,
                ALIUCORD_DISABLE_UPDATER,
                I18n.t("Disable Updater"),
                I18n.t("Disables all of Endcord's core and plugin update checks while enabled. Do not enable this unless you know the repercussions."),
            ) { UpdateWatcher.reschedule() }
        }

        addDivider(ctx)
        addHeader(ctx, I18n.t("Links"))
        addLink(ctx, I18n.t("Source Code"), R.e.ic_account_github_white_24dp) {
            Utils.launchUrl(Constants.ENDCORD_GITHUB_REPO)
        }
        addLink(ctx, I18n.t("Endcord Support Server"), R.e.ic_help_24dp) {
            Utils.joinSupportServer(it.context)
        }
        addLink(ctx, I18n.t("Website"), R.e.ic_open_in_new_white_24dp) {
            Utils.launchUrl(Constants.ENDCORD_WEBSITE)
        }
        addLink(ctx, I18n.t("Endcord for PC"), R.e.ic_open_in_new_white_24dp) {
            Utils.launchUrl(Constants.ENDCORD_PC_GITHUB_REPO)
        }

        addDivider(ctx)
        TextView(ctx, null, 0, R.i.UiKit_Settings_Item_Addition).run {
            text = I18n.t("Endcord is based on Aliucord by Juby210, Vendicated and contributors.")
            linearLayout.addView(this)
        }
    }

    private fun pickLanguage() {
        val languages = I18n.Language.values()
        SelectDialog().apply {
            title = I18n.t("Language")
            items = languages.map { if (it.nativeName == it.englishName) it.nativeName else "${it.nativeName} (${it.englishName})" }.toTypedArray()
            onResultListener = { index ->
                val picked = languages[index]
                if (picked != I18n.language || !I18n.hasExplicitLanguage) {
                    I18n.language = picked
                    LanguageSync.applyDiscordLocale(picked)
                    Utils.promptRestart(I18n.t("A restart is required to apply this change"))
                }
            }
        }.show(parentFragmentManager, "Language")
    }

    private fun addSwitch(
        ctx: Context,
        setting: String,
        title: String,
        subtitle: String?,
        default: Boolean = false,
        onToggled: ((checked: Boolean) -> Unit)? = null,
    ) {
        Utils.createCheckedSetting(ctx, CheckedSetting.ViewType.SWITCH, title, subtitle).run {
            isChecked = Main.settings.getBool(setting, default)
            setOnCheckedListener {
                Main.settings.setBool(setting, it)
                onToggled?.invoke(it)
            }
            linearLayout.addView(this)
        }
    }

    private fun addLink(
        ctx: Context,
        text: String,
        @DrawableRes drawable: Int,
        external: Boolean = true,
        action: View.OnClickListener,
    ) {
        TextView(ctx, null, 0, R.i.UiKit_Settings_Item_Icon).run {
            this.text = text
            // Only links that leave the app get the "open in new" marker
            val drawableEnd = if (!external) null else ContextCompat.getDrawable(ctx, R.e.ic_open_in_new_white_24dp)?.run {
                mutate()
                Utils.tintToTheme(this)
            }
            val drawableStart = ContextCompat.getDrawable(ctx, drawable)?.run {
                mutate()
                Utils.tintToTheme(this)
            }
            setCompoundDrawablesRelativeWithIntrinsicBounds(drawableStart, null, drawableEnd, null)
            setOnClickListener(action)
            linearLayout.addView(this)
        }
    }
}
