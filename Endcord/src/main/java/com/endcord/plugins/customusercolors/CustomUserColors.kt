/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.customusercolors

import android.content.Context
import androidx.fragment.app.FragmentActivity
import b.k.a.a.f as ColorPickerListener
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.after
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.aliucord.wrappers.ChannelWrapper.Companion.recipientIds
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.discord.databinding.WidgetChannelsListItemChannelPrivateBinding
import com.discord.stores.StoreMessageReplies
import com.discord.utilities.colors.ColorPickerUtils
import com.discord.widgets.channels.list.WidgetChannelsListAdapter
import com.discord.widgets.channels.list.items.ChannelListItem
import com.discord.widgets.channels.list.items.ChannelListItemPrivate
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.identitycommon.ChatRefresh
import com.endcord.plugins.identitycommon.Header
import com.endcord.plugins.identitycommon.Members
import com.lytefast.flexinput.R
import org.json.JSONObject
import java.lang.reflect.Field

internal class CustomUserColors : EndcordPlugin(
    name = "CustomUserColors",
    description = "Give any user a custom name color, everywhere. Works best with TypingTweaks and RoleColorEverywhere",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "customisation", "chat")

    override val settingsSchema = listOf(
        PluginSetting.Switch("dmList", "Users with custom colors defined will have their name in the dm list colored", default = true),
        PluginSetting.Switch("colorInServers", "If name colors should be changed within servers", default = true),
    )

    /** User (or group DM) id -> color, without alpha. Mirrors the saved setting. */
    private val colors = HashMap<Long, Int>()

    private fun load() {
        colors.clear()
        try {
            val json = JSONObject(settings.getString(COLORS_KEY, "{}") ?: "{}")
            val keys = json.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val id = key.toLongOrNull() ?: continue
                val hex = json.optString(key)
                val color = hex.toIntOrNull(16) ?: continue
                colors[id] = color
            }
        } catch (e: Throwable) {
            logger.error("Failed to read custom colors", e)
        }
    }

    private fun save() {
        val json = JSONObject()
        // Same format as Endcord PC: six hex digits without '#'
        for ((id, color) in colors) json.put(id.toString(), String.format("%06x", color and 0xFFFFFF))
        settings.setString(COLORS_KEY, json.toString())
        ChatRefresh.refresh()
    }

    /** The custom color of [id] as an opaque color, or null. */
    private fun colorOf(id: Long): Int? = colors[id]?.let { it or 0xFF000000.toInt() }

    private val decorator = object : ChatDecorator(name, priority = 45) {
        override fun afterConfigure(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry) {
            ChatRefresh.track(holder)
            if (colors.isEmpty()) return
            val message = entry.message
            if (!bool("colorInServers") && !Members.isPrivate(message.channelId)) return

            message.author?.let { author ->
                if (!message.isInteraction) colorOf(author.id)?.let { Header.name(holder)?.setTextColor(it) }
            }

            val replyData = entry.replyData ?: return
            if (replyData.messageState !is StoreMessageReplies.MessageState.Loaded) return
            val repliedAuthor = replyData.messageEntry?.message?.author ?: return
            val color = colorOf(repliedAuthor.id) ?: return
            Header.replyName(holder)?.setTextColor(color)
        }
    }

    private val fBinding: Field by lazy {
        WidgetChannelsListAdapter.ItemChannelPrivate::class.java.getDeclaredField("binding").apply { isAccessible = true }
    }

    private fun openPicker(activity: FragmentActivity, id: Long) {
        val dialog = ColorPickerUtils.INSTANCE.buildColorPickerDialog(activity, R.h.custom_color, colorOf(id) ?: (DEFAULT_COLOR or 0xFF000000.toInt()))
        dialog.k = object : ColorPickerListener {
            override fun onColorSelected(dialogId: Int, color: Int) {
                colors[id] = color and 0xFFFFFF
                save()
            }

            // The picker's reset button removes the entry, like Endcord PC's "Delete Entry"
            override fun onColorReset(dialogId: Int) {
                colors.remove(id)
                save()
            }

            override fun onDialogDismissed(dialogId: Int) {}
        }
        dialog.show(activity.supportFragmentManager, "endcord_custom_user_color")
    }

    override fun start(context: Context) {
        load()
        ChatHooks.register(decorator)

        MessageActions.register(name, "Set Color", R.e.ic_theme_24dp, visible = { it.message.author != null }) { ctx ->
            val id = ctx.message.author?.id ?: return@register
            val activity = ctx.sheet.activity ?: return@register
            openPicker(activity, id)
        }

        patcher.after<WidgetChannelsListAdapter.ItemChannelPrivate>("onConfigure", Int::class.javaPrimitiveType!!, ChannelListItem::class.java) { param ->
            try {
                if (!bool("dmList") || colors.isEmpty()) return@after
                val channel = (param.args[1] as? ChannelListItemPrivate)?.channel ?: return@after
                val id = if (channel.type == Members.TYPE_DM) channel.recipientIds.firstOrNull() ?: return@after else channel.id
                val color = colorOf(id) ?: return@after
                (fBinding[this] as WidgetChannelsListItemChannelPrivateBinding).f.setTextColor(color)
            } catch (e: Throwable) {
                logger.error("Failed to color the DM list", e)
            }
        }
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        super.stop(context)
    }

    private companion object {
        const val COLORS_KEY = "colors"
        const val DEFAULT_COLOR = 0x05AFFF
    }
}
