/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.showmeyourname

import android.content.Context
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.widget.TextView
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.wrappers.users.globalName
import com.discord.api.user.User
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.messagesbcommon.ChatDecorator
import com.endcord.plugins.messagesbcommon.ChatHooks
import com.endcord.plugins.messagesbcommon.mutedColor

internal class ShowMeYourName : EndcordPlugin(
    name = "ShowMeYourName",
    description = "Display usernames next to nicks, or no nicks at all",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "customisation")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            key = "mode",
            label = "How to display usernames and nicks",
            options = listOf(
                PluginSetting.Choice.Option("user-nick", "Username then nickname"),
                PluginSetting.Choice.Option("nick-user", "Nickname then username"),
                PluginSetting.Choice.Option("user", "Username only"),
            ),
        ),
        PluginSetting.Switch("displayNames", "Use display names in place of usernames"),
        PluginSetting.Switch("inReplies", "Also apply functionality to reply previews"),
    )

    private val decorator = object : ChatDecorator(name) {
        override fun formatAuthorName(entry: MessageEntry, nick: String, view: TextView): CharSequence? {
            val author = entry.message.author ?: return null
            return render(author, nick, view)
        }

        override fun formatReplyName(entry: MessageEntry, replied: MessageEntry, name: String, view: TextView): CharSequence? {
            if (!bool("inReplies")) return null
            val author = replied.message.author ?: return null
            return render(author, name, view)
        }
    }

    /** Port of Endcord PC's renderUsername. Returns null to keep what Discord shows. */
    private fun render(user: User, nick: String, view: TextView): CharSequence? {
        var username = user.username ?: return null
        if (bool("displayNames")) username = user.globalName?.ifEmpty { null } ?: username
        if (username.equals(nick, ignoreCase = true)) return null

        return when (choice("mode")) {
            "nick-user" -> withSuffix(nick, username, view)
            "user" -> username
            else -> withSuffix(username, nick, view)
        }
    }

    private fun withSuffix(main: String, suffix: String, view: TextView): CharSequence {
        val builder = SpannableStringBuilder(main).append(' ')
        val start = builder.length
        builder.append('(').append(suffix).append(')')
        builder.setSpan(ForegroundColorSpan(mutedColor(view.context)), start, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        return builder
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        super.stop(context)
    }
}
