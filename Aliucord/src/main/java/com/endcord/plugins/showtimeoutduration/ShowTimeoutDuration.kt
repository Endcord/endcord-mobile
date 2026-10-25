/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.showtimeoutduration

import android.content.Context
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.view.View
import android.widget.ImageView
import android.widget.TextView
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.discord.models.member.GuildMember
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.api.UserSheetActions
import com.endcord.plugins.userscommon.Users
import com.lytefast.flexinput.R
import java.lang.reflect.Field

internal class ShowTimeoutDuration : EndcordPlugin(
    name = "ShowTimeoutDuration",
    description = "Shows how much longer a user's timeout will last, either in the timeout icon tooltip or next to it",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("servers", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            key = "displayStyle",
            label = "How to display the timeout duration",
            options = listOf(
                PluginSetting.Choice.Option(STYLE_TOOLTIP, "When tapping the timeout icon"),
                PluginSetting.Choice.Option(STYLE_INLINE, "Next to the timeout icon"),
            ),
            default = STYLE_INLINE,
        ),
    )

    private val fIcon: Field? by lazy {
        try {
            WidgetChatListAdapterItemMessage::class.java.getDeclaredField("communicationDisabledIcon").apply { isAccessible = true }
        } catch (e: Throwable) {
            logger.error("communicationDisabledIcon not found", e)
            null
        }
    }

    private val decorator = object : ChatDecorator(name, priority = 100) {
        override fun timestampSuffix(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry, view: TextView): CharSequence? {
            val icon = iconOf(holder) ?: return null
            val member = entry.author
            val remaining = remainingMillis(member)
            if (icon.visibility != View.VISIBLE || remaining <= 0) {
                icon.setOnClickListener(null)
                icon.isClickable = false
                return null
            }
            val userId = member?.userId ?: 0L
            icon.setOnClickListener { showToast(userId, member) }

            if (choice("displayStyle") != STYLE_INLINE) return null
            val text = "  ${formatDuration(remaining)} ${I18n.t("timeout remaining")}"
            return SpannableString(text).apply {
                setSpan(ForegroundColorSpan(DANGER_COLOR), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        }
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)

        UserSheetActions.register(
            name,
            "Show Timeout Duration",
            R.e.ic_timer_white_a60_24dp,
            visible = { remainingMillis(it.state.guildMember) > 0 },
        ) { ctx ->
            showToast(ctx.user.id, ctx.state.guildMember)
        }
    }

    private fun iconOf(holder: WidgetChatListAdapterItemMessage): ImageView? = try {
        fIcon?.get(holder) as ImageView?
    } catch (_: Throwable) {
        null
    }

    private fun showToast(userId: Long, member: GuildMember?) {
        val remaining = remainingMillis(member)
        if (remaining <= 0) return
        val name = Users.displayName(userId)
        Utils.showToast(I18n.t("{username} has {countdown} remaining in timeout.", "username" to name, "countdown" to formatDuration(remaining)), true)
    }

    private fun remainingMillis(member: GuildMember?): Long {
        val until = member?.communicationDisabledUntil?.g() ?: return 0L
        return until - System.currentTimeMillis()
    }

    /** A compact duration like "2d 3h", "4h 20m" or "45s". */
    private fun formatDuration(millis: Long): String {
        var seconds = millis / 1000
        val days = seconds / 86400
        seconds %= 86400
        val hours = seconds / 3600
        seconds %= 3600
        val minutes = seconds / 60
        seconds %= 60
        val parts = ArrayList<String>(2)
        if (days > 0) parts.add(I18n.t("{count}d", "count" to days))
        if (hours > 0) parts.add(I18n.t("{count}h", "count" to hours))
        if (minutes > 0 && days == 0L) parts.add(I18n.t("{count}m", "count" to minutes))
        if (parts.isEmpty() || (days == 0L && hours == 0L && minutes < 10 && seconds > 0)) {
            parts.add(I18n.t("{count}s", "count" to seconds))
        }
        return parts.take(2).joinToString(" ")
    }

    private companion object {
        const val STYLE_TOOLTIP = "tooltip"
        const val STYLE_INLINE = "inline"
        const val DANGER_COLOR = 0xFFED4245.toInt()
    }
}
