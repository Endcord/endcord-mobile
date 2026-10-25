/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.customreactionbuttons

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.discord.api.permission.Permission
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.composercommon.ComposerUtils
import com.lytefast.flexinput.R
import java.util.regex.Pattern

/**
 * Endcord PC puts these buttons in the message hover bar. Android has no hover bar, so every button is an entry
 * of the message long-press sheet, and the button list is a text setting instead of PC's editor.
 */
internal class CustomReactionButtons : EndcordPlugin(
    name = "CustomReactionButtons",
    description = "Adds your own reaction buttons to the message long-press menu. Use any emoji, or a server emoji as <:name:id>.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility", "reactions")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            key = "buttons",
            label = "Reaction buttons",
            description = "One button per line: an emoji, :name:123 or <a:name:123>, then an optional label",
            default = "👍 Like",
            multiline = true,
        ),
    )

    private class Button(val reaction: String, val label: String)

    override fun start(context: Context) {
        registerButtons()
    }

    override fun onSettingChanged(key: String) {
        if (key != "buttons") return
        MessageActions.unregisterAll(name)
        registerButtons()
    }

    private fun registerButtons() {
        for (button in parseButtons()) {
            MessageActions.register(
                name,
                button.label,
                R.e.ic_add_reaction_grey_a60_24dp,
                visible = { ctx ->
                    val inGuild = (ctx.model.channel?.guildId ?: 0L) != 0L
                    val permissions = ctx.model.permissions
                    !ctx.message.isLocal &&
                        (!inGuild || permissions == null || permissions and Permission.ADD_REACTIONS != 0L)
                },
            ) { ctx ->
                ComposerUtils.addReaction(ctx.message.channelId, ctx.message.id, button.reaction) { ok ->
                    if (!ok) Utils.showToast(I18n.t("Failed to add reaction"))
                }
            }
        }
    }

    private fun parseButtons(): List<Button> {
        val buttons = ArrayList<Button>()
        for (rawLine in string("buttons").split('\n')) {
            val line = rawLine.trim()
            if (line.isEmpty()) continue
            val space = line.indexOf(' ')
            val emoji = if (space < 0) line else line.substring(0, space)
            val label = if (space < 0) "" else line.substring(space + 1).trim()

            val custom = CUSTOM_EMOJI.matcher(emoji)
            val button = if (custom.matches()) {
                val emojiName = custom.group(1)!!
                Button("$emojiName:${custom.group(2)}", if (label.isEmpty()) ":$emojiName:" else "$label (:$emojiName:)")
            } else {
                Button(emoji, if (label.isEmpty()) emoji else "$emoji $label")
            }
            buttons += button
        }
        return buttons
    }

    private companion object {
        /** `<:name:id>`, `<a:name:id>`, `:name:id` and `name:id`, like Endcord PC's parser. */
        val CUSTOM_EMOJI: Pattern = Pattern.compile("^(?:<a?)?:?(\\w+?)(?:~\\d+)?:(\\d+)>?$")
    }
}
