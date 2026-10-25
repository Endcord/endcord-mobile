/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.showhiddenchannels

import android.content.Context
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.util.TypedValue
import android.view.View
import android.widget.TextView
import com.aliucord.i18n.I18n
import com.aliucord.fragments.SettingsPage
import com.aliucord.utils.DimenUtils
import com.aliucord.wrappers.ChannelWrapper.Companion.bitrate
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.aliucord.wrappers.ChannelWrapper.Companion.lastMessageId
import com.aliucord.wrappers.ChannelWrapper.Companion.name
import com.aliucord.wrappers.ChannelWrapper.Companion.nsfw
import com.aliucord.wrappers.ChannelWrapper.Companion.permissionOverwrites
import com.aliucord.wrappers.ChannelWrapper.Companion.rateLimitPerUser
import com.aliucord.wrappers.ChannelWrapper.Companion.rtcRegion
import com.aliucord.wrappers.ChannelWrapper.Companion.topic
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.aliucord.wrappers.ChannelWrapper.Companion.userLimit
import com.aliucord.wrappers.GuildRoleWrapper.Companion.color
import com.aliucord.wrappers.GuildRoleWrapper.Companion.name
import com.aliucord.wrappers.GuildRoleWrapper.Companion.permissions
import com.aliucord.wrappers.GuildRoleWrapper.Companion.position
import com.aliucord.wrappers.PermissionOverwriteWrapper.Companion.allowed
import com.aliucord.wrappers.PermissionOverwriteWrapper.Companion.denied
import com.aliucord.wrappers.PermissionOverwriteWrapper.Companion.id
import com.aliucord.wrappers.PermissionOverwriteWrapper.Companion.type
import com.discord.api.channel.Channel
import com.discord.api.permission.PermissionOverwrite
import com.discord.stores.StoreStream
import com.endcord.plugins.guildscommon.Formats
import com.lytefast.flexinput.R

/** Explains a channel the user cannot view: what it is, its topic, when it was last active and who can see it. */
internal class HiddenChannelPage : SettingsPage() {
    private var channelId = 0L

    override fun onViewBound(view: View) {
        super.onViewBound(view)
        val ctx = view.context
        val channel = StoreStream.getChannels().getChannel(channelId)
        if (channel == null) {
            setActionBarTitle(I18n.t("Hidden Channel"))
            addView(text(ctx, I18n.t("This channel no longer exists."), R.i.UiKit_Settings_Item_Addition))
            return
        }
        setActionBarTitle(channel.name)
        StoreStream.getGuilds().getGuild(channel.guildId)?.let { setActionBarSubtitle(it.name) }

        addView(text(ctx, I18n.t(headline(channel)), R.i.UiKit_TextView_H1).apply {
            val p = DimenUtils.dpToPx(16)
            setPadding(p, p, p, DimenUtils.dpToPx(4))
        })
        explanation(channel)?.let { addView(text(ctx, I18n.t(it), R.i.UiKit_Settings_Item_Addition)) }

        val topic = channel.topic
        if (!topic.isNullOrBlank()) {
            addHeader(ctx, I18n.t(if (channel.type == Channel.GUILD_FORUM) "Guidelines" else "Topic"))
            addView(text(ctx, topic, R.i.UiKit_Settings_Item_Addition).apply { setTextIsSelectable(true) })
        }

        addHeader(ctx, I18n.t("Details"))
        val voice = channel.type == Channel.GUILD_VOICE || channel.type == Channel.GUILD_STAGE_VOICE
        if (channel.lastMessageId != 0L && !voice) {
            val label = if (channel.type == Channel.GUILD_FORUM) "Last post: {time}" else "Last message: {time}"
            addView(detail(ctx, I18n.t(label, "time" to Formats.dateTime(Formats.snowflakeTime(channel.lastMessageId)))))
        }
        addView(detail(ctx, I18n.t("Created: {time}", "time" to Formats.dateTime(Formats.snowflakeTime(channel.id)))))
        if (channel.rateLimitPerUser > 0) {
            addView(detail(ctx, I18n.t("Slowmode: {duration}", "duration" to Formats.duration(channel.rateLimitPerUser.toLong()))))
        }
        if (voice) {
            addView(detail(ctx, I18n.t("Bitrate: {bitrate} kbps", "bitrate" to channel.bitrate / 1000)))
            if (channel.userLimit > 0) addView(detail(ctx, I18n.t("User limit: {count}", "count" to channel.userLimit)))
            addView(detail(ctx, I18n.t("Region: {region}", "region" to (channel.rtcRegion ?: I18n.t("Automatic")))))
        }
        if (channel.nsfw) addView(detail(ctx, I18n.t("Age-restricted channel")))

        addHeader(ctx, I18n.t("Allowed users and roles:"))
        val allowed = allowedList(channel)
        if (allowed.isEmpty()) {
            addView(detail(ctx, I18n.t("Nobody else can see this channel.")))
        } else {
            for (line in allowed) addView(detail(ctx, line))
        }
    }

    private fun headline(channel: Channel) = when (channel.type) {
        Channel.GUILD_TEXT -> "This is a hidden text channel"
        Channel.GUILD_VOICE -> "This is a hidden voice channel"
        Channel.GUILD_ANNOUNCEMENT -> "This is a hidden announcement channel"
        Channel.GUILD_FORUM -> "This is a hidden forum channel"
        Channel.GUILD_STAGE_VOICE -> "This is a hidden stage channel"
        else -> "This is a hidden channel"
    }

    private fun explanation(channel: Channel) = when (channel.type) {
        Channel.GUILD_VOICE, Channel.GUILD_STAGE_VOICE -> "You don't have permission to join or see this channel."
        Channel.GUILD_FORUM -> "You can't see the posts in this channel."
        else -> "You can't see the messages in this channel."
    }

    /** Roles and members with access, from the server's roles and the channel's permission overwrites. */
    private fun allowedList(channel: Channel): List<CharSequence> {
        val guildId = channel.guildId
        val guild = StoreStream.getGuilds().getGuild(guildId)
        val roles = StoreStream.getGuilds().roles[guildId] ?: emptyMap()
        val overwrites = channel.permissionOverwrites
        val out = ArrayList<CharSequence>()

        guild?.ownerId?.let { ownerId ->
            out += I18n.t("Server owner: {user}", "user" to userName(guildId, ownerId))
        }

        val view = ShowHiddenChannels.VIEW_CHANNEL
        fun roleOverwrite(roleId: Long) = overwrites.firstOrNull { it.type == PermissionOverwrite.Type.ROLE && it.id == roleId }
        val everyoneDenies = roleOverwrite(guildId)?.let { (it.denied and view) != 0L } == true

        roles.values.sortedByDescending { it.position }.forEach { role ->
            val admin = (role.permissions and ADMINISTRATOR) != 0L
            val overwrite = roleOverwrite(role.id)
            val access = admin || (overwrite != null && (overwrite.allowed and view) != 0L) ||
                (role.id == guildId && !everyoneDenies && (role.permissions and view) != 0L)
            if (!access) return@forEach
            val name = if (role.id == guildId) "@everyone" else role.name
            out += SpannableStringBuilder(name).apply {
                if (role.color != 0) setSpan(ForegroundColorSpan(role.color or 0xFF000000.toInt()), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                if (admin) append(" (").append(I18n.t("Administrator")).append(")")
            }
        }

        for (overwrite in overwrites) {
            if (overwrite.type != PermissionOverwrite.Type.MEMBER || (overwrite.allowed and ShowHiddenChannels.VIEW_CHANNEL) == 0L) continue
            out += userName(guildId, overwrite.id)
        }
        return out
    }

    private fun userName(guildId: Long, userId: Long): String {
        val nick = StoreStream.getGuilds().getMember(guildId, userId)?.nick
        val user = StoreStream.getUsers().users[userId]
        return nick ?: user?.username ?: userId.toString()
    }

    private fun text(ctx: Context, value: CharSequence, style: Int) = TextView(ctx, null, 0, style).apply { text = value }

    private fun detail(ctx: Context, value: CharSequence) = TextView(ctx, null, 0, R.i.UiKit_Settings_Item_Addition).apply {
        text = value
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
    }

    companion object {
        private const val ADMINISTRATOR = 1L shl 3

        fun create(channelId: Long) = HiddenChannelPage().apply { this.channelId = channelId }
    }
}
