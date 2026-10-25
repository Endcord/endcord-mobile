/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.hideservers

import android.content.Context
import androidx.appcompat.app.AlertDialog
import com.aliucord.Utils
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.discord.stores.StoreGuildsSorted
import com.discord.stores.StoreStream
import com.endcord.plugins.guildscommon.GuildListHooks
import com.endcord.plugins.guildscommon.GuildMenuActions
import com.endcord.plugins.guildscommon.GuildsPlugin
import com.lytefast.flexinput.R

internal class HideServers : GuildsPlugin(
    name = "HideServers",
    description = "Allows you to hide servers from the server list by long-pressing them",
) {
    override val tags = listOf("servers", "appearance")

    override val settingsSchema = listOf(
        PluginSetting.Action("manage", "Hidden Servers", "Choose which hidden servers to show again") { showManager(it) },
        PluginSetting.Action("reset", "Reset Hidden Servers", "Remove all hidden guilds from the list") {
            saveIds(KEY, emptyList())
            GuildListHooks.refresh()
            Utils.showToast(I18n.t("All servers are visible again"))
        },
    )

    override fun load(context: Context) {
        super.load(context)
        GuildListHooks.prepare()
    }

    override fun start(context: Context) {
        GuildListHooks.register(name, object : GuildListHooks.Transformer {
            override fun entries(entries: MutableList<StoreGuildsSorted.Entry>) {
                val hidden = ids(KEY)
                if (hidden.isEmpty()) return
                val selected = StoreStream.getGuildSelected().selectedGuildId
                // The open server stays visible until you leave it, so the list still shows where you are.
                GuildListHooks.removeGuilds(entries) { it.id in hidden && it.id != selected }
            }

            override fun beforeSave(entries: MutableList<StoreGuildsSorted.Entry>, saved: List<StoreGuildsSorted.Entry>) {
                if (ids(KEY).isNotEmpty()) GuildListHooks.restoreMissing(entries, saved)
            }
        }, priority = 0)

        GuildMenuActions.register(name, { "Hide Server" }, R.e.ic_eye) { ctx ->
            val hidden = ids(KEY)
            if (ctx.guild.id !in hidden) hidden += ctx.guild.id
            saveIds(KEY, hidden)
            GuildListHooks.refresh()
            Utils.showToast(I18n.t("Hid {server}. Show it again from the HideServers settings.", "server" to ctx.guild.name))
        }
        GuildListHooks.refresh()
    }

    override fun stop(context: Context) {
        super.stop(context)
        GuildListHooks.refresh()
    }

    private fun showManager(context: Context) {
        val hidden = ids(KEY)
        if (hidden.isEmpty()) {
            Utils.showToast(I18n.t("No hidden servers"))
            return
        }
        val names = hidden.map { id -> StoreStream.getGuilds().getGuild(id)?.name ?: id.toString() }
        val checked = BooleanArray(hidden.size) { true }
        AlertDialog.Builder(context)
            .setTitle(I18n.t("Hidden Servers"))
            .setMultiChoiceItems(names.toTypedArray(), checked) { _, which, isChecked -> checked[which] = isChecked }
            .setPositiveButton(I18n.t("Save")) { _, _ ->
                saveIds(KEY, hidden.filterIndexed { i, _ -> checked[i] })
                GuildListHooks.refresh()
            }
            .setNegativeButton(I18n.t("Cancel"), null)
            .show()
    }

    private companion object {
        const val KEY = "hiddenGuilds"
    }
}
