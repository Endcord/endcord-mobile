/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.actionscommon

import android.app.Activity
import android.content.Context
import android.content.Intent
import androidx.fragment.app.FragmentManager
import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.fragments.SelectDialog
import com.aliucord.i18n.I18n
import com.aliucord.utils.ChannelUtils
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.users.globalName
import com.discord.app.AppActivity
import com.discord.models.message.Message
import com.discord.stores.StoreStream
import com.discord.utilities.intent.IntentUtils
import java.text.DateFormat
import java.util.Date
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import com.discord.api.user.User as ApiUser
import com.discord.models.user.User as ModelUser

/** Small helpers shared by the message action ports (Bookmarks, MessageTags, ViewRaw, ...). */
internal object Common {
    private val logger = Logger("ActionsCommon")

    /**
     * Single thread for writing plugin data, so saves of the same store never race each other and never
     * touch the disk on the main thread.
     */
    val io: ExecutorService by lazy { Executors.newSingleThreadExecutor() }

    /** Name shown for a user: their display name when they have one, otherwise their username. */
    fun displayName(user: ApiUser?): String {
        if (user == null) return I18n.t("Unknown")
        val global = try {
            user.globalName
        } catch (_: Throwable) {
            null
        }
        return if (global.isNullOrBlank()) user.username else global
    }

    /** Same as [displayName] for the model user type used by stores and the user sheet. */
    fun displayName(user: ModelUser?): String {
        if (user == null) return I18n.t("Unknown")
        val global = try {
            user.globalName
        } catch (_: Throwable) {
            null
        }
        return if (global.isNullOrBlank()) user.username else global
    }

    /** One line preview of a message's text, [max] characters at most. */
    fun preview(message: Message, max: Int = 140): String = preview(message.content, max)

    /** One line preview of [text], [max] characters at most. */
    fun preview(text: String?, max: Int = 140): String {
        val flat = text.orEmpty().replace('\n', ' ').trim()
        return if (flat.length > max) flat.substring(0, max).trimEnd() + "…" else flat
    }

    /** Guild of a channel, or `null` for direct messages and channels that are not cached. */
    fun guildIdOf(channelId: Long): Long? {
        val channel = StoreStream.getChannels().getChannel(channelId) ?: return null
        return channel.guildId.takeIf { it != 0L }
    }

    /** Human readable name of a channel, like `#general · Server` or the name of the other DM user. */
    fun channelTitle(channelId: Long): String {
        val channel = StoreStream.getChannels().getChannel(channelId) ?: return I18n.t("Unknown channel")
        val guildId = channel.guildId
        val name = try {
            ChannelUtils.getDisplayName(channel)
        } catch (e: Throwable) {
            null
        }
        if (guildId == 0L) return if (name.isNullOrEmpty()) I18n.t("Direct message") else name
        val guildName = StoreStream.getGuilds().getGuild(guildId)?.name
        return "#${name.orEmpty()}" + if (guildName != null) " · $guildName" else ""
    }

    /** Name of a guild, or "Direct Messages" for [guildId] `null`. */
    fun guildTitle(guildId: Long?): String {
        if (guildId == null || guildId == 0L) return I18n.t("Direct Messages")
        return StoreStream.getGuilds().getGuild(guildId)?.name ?: I18n.t("Unknown server")
    }

    /** `https://discord.com/channels/...` link of a message. */
    fun messageLink(channelId: Long, messageId: Long): String =
        "https://discord.com/channels/${guildIdOf(channelId) ?: "@me"}/$channelId/$messageId"

    /** Formats a timestamp in the user's locale, like `Oct 25, 2026 6:00 PM`. */
    fun formatTime(millis: Long): String =
        DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(millis))

    /** Copies [text] to the clipboard and confirms it with a toast. */
    fun copy(text: String, toast: String = "Copied to clipboard") {
        Utils.setClipboard("Endcord", text)
        Utils.showToast(I18n.t(toast))
    }

    /**
     * Opens [channelId] and jumps to [messageId] from anywhere in the app, the same way tapping one of
     * Discord's notifications does. Use [jumpInChat] when the chat is already in front.
     */
    fun openMessage(context: Context, channelId: Long, messageId: Long?) {
        try {
            val intent = routeIntent(context, channelId, messageId)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            if (context !is Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Throwable) {
            logger.errorToast(I18n.t("Failed to open the message"), e)
        }
    }

    /** Intent that opens the main screen at [channelId] (and [messageId]), as Discord's notifications build it. */
    fun routeIntent(context: Context, channelId: Long, messageId: Long?): Intent =
        IntentUtils.RouteBuilders.selectChannel(channelId, guildIdOf(channelId) ?: 0L, messageId)
            .setClass(context, AppActivity.Main::class.java)

    /** Scrolls the open chat to a message, loading it first if needed. */
    fun jumpInChat(channelId: Long, messageId: Long) {
        StoreStream.getMessagesLoader().jumpToMessage(channelId, messageId)
    }

    /** Lets the user pick one of [items] (already translated), then calls [onPick] with its index. */
    fun pick(fragmentManager: FragmentManager, title: String, items: List<String>, onPick: (Int) -> Unit) {
        SelectDialog().apply {
            this.title = title
            this.items = items.toTypedArray()
            onResultListener = { index ->
                try {
                    onPick(index)
                } catch (e: Throwable) {
                    logger.errorToast(I18n.t("Action failed"), e)
                }
            }
        }.show(fragmentManager, "EndcordPick")
    }

    /** Runs [block] on the main thread. */
    fun ui(block: () -> Unit) {
        Utils.mainThread.post {
            try {
                block()
            } catch (e: Throwable) {
                logger.error("UI callback failed", e)
            }
        }
    }
}
