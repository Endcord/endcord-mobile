/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.hypesquadswitcher

import android.content.Context
import androidx.appcompat.app.AlertDialog
import com.aliucord.Http
import com.aliucord.Utils
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.discord.stores.StoreStream
import com.endcord.plugins.commandscommon.Net
import com.endcord.plugins.commandscommon.Options

/**
 * Joins, switches or leaves a HypeSquad house for the user's own account. Nothing happens on its own: the house
 * only changes when the user picks one with `/hypesquad` or the button on the settings page.
 */
internal class HypeSquadSwitcher : EndcordPlugin(
    name = "HypeSquadSwitcher",
    description = "Easily switch between HypeSquad houses or remove your badge",
    authors = arrayOf("vpg"),
) {
    override val tags = listOf("profile", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Action(
            key = "change",
            label = "Change HypeSquad house",
            description = "Pick a house for your badge, or remove it. You can also use /hypesquad.",
        ) { pick(it) },
    )

    @Volatile
    private var busy = false

    override fun start(context: Context) {
        val choices = HOUSES.indices.map { Utils.createCommandChoice(HOUSES[it], it.toString()) }
        commands.registerCommand(
            "hypesquad",
            "Apply or remove your HypeSquad badge",
            listOf(Options.integer("house", "0: Remove | 1: Bravery | 2: Brilliance | 3: Balance", required = true, choices = choices)),
        ) { ctx ->
            // Commands run off the main thread, so the request can block here
            CommandResult(apply(ctx.getRequiredInt("house")), null, false)
        }
    }

    /** Asks which house to join, then applies it in the background. */
    private fun pick(context: Context) {
        val current = currentHouse()
        val labels = HOUSES.mapIndexed { i, label ->
            val text = I18n.t(label)
            if (i == current) "$text (${I18n.t("current")})" else text
        }.toTypedArray()
        AlertDialog.Builder(context)
            .setTitle(I18n.t("Change HypeSquad house"))
            .setItems(labels) { _, which ->
                if (which == current) return@setItems
                Utils.threadPool.execute { Utils.showToast(apply(which)) }
            }
            .setNegativeButton(I18n.t("Cancel"), null)
            .show()
    }

    /** The house the account is in now according to its public flags: 0 for none. */
    private fun currentHouse(): Int {
        val flags = try {
            StoreStream.getUsers().me.flags.toLong()
        } catch (_: Throwable) {
            0L
        }
        return when {
            flags and FLAG_BRAVERY != 0L -> 1
            flags and FLAG_BRILLIANCE != 0L -> 2
            flags and FLAG_BALANCE != 0L -> 3
            else -> 0
        }
    }

    /** Sends the change to Discord and returns the message to show. Blocking, never call it on the main thread. */
    private fun apply(house: Int): String {
        if (house !in HOUSES.indices) {
            return I18n.t("Invalid house. Use 0 (remove), 1 (Bravery), 2 (Brilliance) or 3 (Balance).")
        }
        if (busy) return I18n.t("Your HypeSquad house is already being changed.")
        busy = true
        return try {
            if (house == 0) {
                Net.text(Http.Request.newDiscordRNRequest("/hypesquad/online", "DELETE"))
                I18n.t("HypeSquad badge removed")
            } else {
                Net.text(Http.Request.newDiscordRNRequest("/hypesquad/online", "POST"), "{\"house_id\":$house}")
                I18n.t("HypeSquad house set to {house}", "house" to I18n.t(HOUSES[house]))
            }
        } catch (e: Throwable) {
            logger.error("Failed to change HypeSquad house", e)
            I18n.t("Couldn't change your HypeSquad house: {error}", "error" to Net.describe(e))
        } finally {
            busy = false
        }
    }

    private companion object {
        /** Index is the house id Discord expects; 0 removes the badge. */
        val HOUSES = arrayOf("Remove Badge", "House Bravery", "House Brilliance", "House Balance")

        const val FLAG_BRAVERY = 1L shl 6
        const val FLAG_BRILLIANCE = 1L shl 7
        const val FLAG_BALANCE = 1L shl 8
    }
}
