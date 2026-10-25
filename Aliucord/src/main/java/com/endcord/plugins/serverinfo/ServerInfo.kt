/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.serverinfo

import android.content.Context
import android.util.TypedValue
import android.view.View
import android.widget.TextView
import com.aliucord.Utils
import com.aliucord.fragments.SettingsPage
import com.aliucord.i18n.I18n
import com.discord.stores.StoreStream
import com.discord.utilities.time.TimeUtils
import com.endcord.plugins.guildscommon.Formats
import com.endcord.plugins.guildscommon.GuildMenuActions
import com.endcord.plugins.guildscommon.GuildsPlugin
import com.lytefast.flexinput.R

internal class ServerInfo : GuildsPlugin(
    name = "ServerInfo",
    description = "Allows you to view info about a server",
) {
    override val tags = listOf("servers", "utility")

    override fun start(context: Context) {
        GuildMenuActions.register(name, { "Server Info" }, R.e.ic_info_24dp) { ctx ->
            Utils.openPageWithProxy(ctx.activity, ServerInfoPage.create(ctx.guild.id))
        }
    }
}

/** Everything the app knows about a server, each value copyable with a long press. */
internal class ServerInfoPage : SettingsPage() {
    private var guildId = 0L

    override fun onViewBound(view: View) {
        super.onViewBound(view)
        val ctx = view.context
        val guild = StoreStream.getGuilds().getGuild(guildId)
        setActionBarTitle(I18n.t("Server Info"))
        if (guild == null) {
            addView(row(ctx, I18n.t("This server is not available."), null))
            return
        }
        setActionBarSubtitle(guild.name)

        addHeader(ctx, I18n.t("Server"))
        add(ctx, "Name", guild.name)
        add(ctx, "ID", guild.id.toString())
        guild.description?.takeIf { it.isNotBlank() }?.let { add(ctx, "Description", it) }
        add(ctx, "Owner", userName(guild.ownerId) + " (" + guild.ownerId + ")")
        add(ctx, "Created", Formats.dateTime(Formats.snowflakeTime(guild.id)))
        guild.joinedAt?.let { joined ->
            val millis = try {
                TimeUtils.parseUTCDate(joined)
            } catch (_: Throwable) {
                0L
            }
            if (millis > 0) add(ctx, "Joined", Formats.dateTime(millis))
        }
        guild.vanityUrlCode?.takeIf { it.isNotBlank() }?.let { add(ctx, "Vanity URL", "discord.gg/$it") }
        guild.preferredLocale?.let { add(ctx, "Language", it) }

        addHeader(ctx, I18n.t("Counts"))
        if (guild.memberCount > 0) add(ctx, "Members", guild.memberCount.toString())
        val channels = StoreStream.getChannels().getChannelsForGuild(guild.id)
        add(ctx, "Channels", channels.size.toString())
        add(ctx, "Roles", (StoreStream.getGuilds().roles[guild.id]?.size ?: guild.roles.size).toString())
        add(ctx, "Emojis", guild.emojis.size.toString())
        add(ctx, "Stickers", guild.stickers.size.toString())
        add(ctx, "Boosts", I18n.t("{count} (level {level})", "count" to guild.premiumSubscriptionCount, "level" to guild.premiumTier))

        addHeader(ctx, I18n.t("Safety"))
        add(ctx, "Verification level", guild.verificationLevel?.name?.lowercase()?.replace('_', ' ') ?: "-")
        add(ctx, "Explicit content filter", guild.explicitContentFilter?.name?.lowercase()?.replace('_', ' ') ?: "-")
        add(ctx, "Two-factor requirement for moderation", I18n.t(if (guild.mfaLevel > 0) "On" else "Off"))
        if (guild.nsfw) add(ctx, "Age-restricted", I18n.t("On"))

        val features = guild.features.map { it.name.lowercase().replace('_', ' ') }.sorted()
        if (features.isNotEmpty()) {
            addHeader(ctx, I18n.t("Features"))
            addView(row(ctx, features.joinToString(", "), null))
        }
    }

    private fun add(ctx: Context, label: String, value: String) {
        addView(row(ctx, I18n.t(label) + ": " + value, value))
    }

    private fun row(ctx: Context, text: CharSequence, copy: String?) = TextView(ctx, null, 0, R.i.UiKit_Settings_Item_Addition).apply {
        this.text = text
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        if (copy != null) {
            setOnLongClickListener {
                Utils.setClipboard("Server Info", copy)
                Utils.showToast(I18n.t("Copied!"))
                true
            }
        }
    }

    private fun userName(id: Long): String = StoreStream.getUsers().users[id]?.username ?: I18n.t("Unknown user")

    companion object {
        fun create(guildId: Long) = ServerInfoPage().apply { this.guildId = guildId }
    }
}
