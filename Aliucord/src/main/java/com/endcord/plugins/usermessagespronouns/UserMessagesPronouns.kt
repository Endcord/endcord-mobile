/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.usermessagespronouns

import android.content.Context
import android.widget.TextView
import com.aliucord.api.rn.user.RNUserProfile
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.discord.stores.StoreStream
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.identitycommon.Members

/**
 * The Pronouns core plugin shows pronouns in profiles; this adds them to message headers. Like Endcord PC it
 * only uses profiles the app already loaded (opening someone's profile loads it) and never fetches any itself.
 */
internal class UserMessagesPronouns : EndcordPlugin(
    name = "UserMessagesPronouns",
    description = "Adds pronouns to chat user messages",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "appearance")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            "pronounsFormat",
            "The format for pronouns to appear in chat",
            options = listOf(
                PluginSetting.Choice.Option("LOWERCASE", "Lowercase"),
                PluginSetting.Choice.Option("CAPITALIZED", "Capitalized"),
            ),
        ),
        PluginSetting.Switch("showSelf", "Enable or disable showing pronouns for yourself", default = true),
    )

    private val newLines = java.util.regex.Pattern.compile("\n+")

    private fun pronounsOf(userId: Long, guildId: Long): String? {
        val profile = StoreStream.getUserProfile().getUserProfile(userId) as? RNUserProfile ?: return null
        val guildPronouns = profile.guildMemberProfile?.takeIf { guildId != 0L && it.guildId == guildId }?.pronouns
        val raw = guildPronouns?.takeIf { it.isNotBlank() } ?: profile.userProfile?.pronouns ?: return null
        val pronouns = newLines.matcher(raw.trim()).replaceAll("")
        if (pronouns.isEmpty()) return null
        return if (choice("pronounsFormat") == "CAPITALIZED") pronouns else pronouns.lowercase()
    }

    private val decorator = object : ChatDecorator(name, priority = 80) {
        override fun timestampSuffix(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, view: TextView): CharSequence? {
            val message = entry.message
            val author = message.author ?: return null
            if (author.e() == true || author.o() == true || message.type == AUTO_MODERATION_ACTION) return null
            if (!bool("showSelf") && author.id == Members.myId()) return null
            val pronouns = pronounsOf(author.id, Members.guildId(message)) ?: return null
            return " • $pronouns"
        }
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        super.stop(context)
    }

    private companion object {
        const val AUTO_MODERATION_ACTION = 24
    }
}
