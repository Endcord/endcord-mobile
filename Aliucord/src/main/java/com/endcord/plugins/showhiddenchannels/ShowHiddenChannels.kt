/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.showhiddenchannels

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.before
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.discord.api.channel.Channel
import com.discord.databinding.WidgetChannelsListItemChannelBinding
import com.discord.databinding.WidgetChannelsListItemChannelVoiceBinding
import com.discord.stores.StoreStream
import com.discord.utilities.permissions.PermissionUtils
import com.discord.widgets.channels.list.items.ChannelListItem
import com.discord.widgets.channels.list.items.ChannelListItemTextChannel
import com.discord.widgets.channels.list.items.ChannelListItemVoiceChannel
import com.endcord.plugins.guildscommon.ChannelListHooks
import com.endcord.plugins.guildscommon.GuildsPlugin
import com.lytefast.flexinput.R
import de.robv.android.xposed.XC_MethodHook

internal class ShowHiddenChannels : GuildsPlugin(
    name = "ShowHiddenChannels",
    description = "Show channels that you do not have access to view.",
) {
    override val tags = listOf("servers", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            key = "hideUnreads",
            label = "Hide Unreads",
            description = "Never show hidden channels as unread or with mentions",
            default = true,
        ),
        PluginSetting.Choice(
            key = "showMode",
            label = "The mode used to display hidden channels.",
            options = listOf(
                PluginSetting.Choice.Option("lock", "Plain style with Lock Icon instead"),
                PluginSetting.Choice.Option("muted", "Muted style with the normal icon"),
            ),
        ),
    )

    override fun load(context: Context) {
        super.load(context)
        ChannelListHooks.prepare()
    }

    override fun onSettingChanged(key: String) {
        if (key == "hideUnreads") ChannelListHooks.refresh() else ChannelListHooks.rebind()
    }

    override fun start(context: Context) {
        ChannelListHooks.unregisterAll(resetOwner)

        // Inside Discord's channel list builder (and only there) pretend every channel can be viewed, so hidden
        // channels are laid out like the others: positions, categories and collapsing stay Discord's own.
        patcher.patch(
            PermissionUtils::class.java.getDeclaredMethod("can", Long::class.javaPrimitiveType!!, Long::class.javaObjectType),
            object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam) {
                    if (param.args[0] == VIEW_CHANNEL && ChannelListHooks.isBuilding()) param.result = true
                }
            },
        )
        patcher.before<PermissionUtils>("hasAccess", Channel::class.java, Long::class.javaObjectType) { param ->
            if (ChannelListHooks.isBuilding()) param.result = true
        }

        ChannelListHooks.register(name, object : ChannelListHooks.Transformer {
            override fun guildList(guildId: Long, items: MutableList<ChannelListItem>) {
                if (!bool("hideUnreads")) return
                val it = items.listIterator()
                while (it.hasNext()) {
                    when (val item = it.next()) {
                        is ChannelListItemTextChannel -> if (isHidden(item.channel) && (item.isUnread || item.mentionCount > 0)) {
                            it.set(ChannelListItemTextChannel(item.channel, item.selected, 0, false, item.muted, item.isLocked,
                                item.hasActiveThreads, item.isGuildRoleSubscriptionLockedChannel, item.isGuildRoleSubscriptionChannel))
                        }
                        is ChannelListItemVoiceChannel -> if (isHidden(item.channel) && (item.isUnread || item.mentionCount > 0)) {
                            it.set(ChannelListItemVoiceChannel(item.channel, item.textSelected, item.voiceSelected, item.permission,
                                0, false, item.numUsersConnected, item.isLocked, item.isNsfw, item.isAnyoneUsingVideo,
                                item.guildMaxVideoChannelUsers, item.isGuildRoleSubscriptionLockedChannel,
                                item.isGuildRoleSubscriptionChannel, item.guildScheduledEvent))
                        }
                    }
                }
            }
        })

        ChannelListHooks.registerDecorator(name, object : ChannelListHooks.RowDecorator {
            override fun text(item: ChannelListItemTextChannel, binding: WidgetChannelsListItemChannelBinding) {
                decorate(binding.a, binding.c, isHidden(item.channel))
            }

            override fun voice(item: ChannelListItemVoiceChannel, binding: WidgetChannelsListItemChannelVoiceBinding) {
                decorate(binding.a, binding.e, isHidden(item.channel))
            }
        })

        ChannelListHooks.interceptSelect(name) { channel ->
            if (!isHidden(channel)) return@interceptSelect false
            Utils.openPageWithProxy(Utils.appActivity, HiddenChannelPage.create(channel.id))
            true
        }

        ChannelListHooks.refresh()
    }

    override fun stop(context: Context) {
        super.stop(context)
        // Discord never resets a row's alpha, so recycled rows would stay dimmed until a restart
        ChannelListHooks.unregisterAll(resetOwner)
        ChannelListHooks.registerDecorator(resetOwner, resetDimming)
        ChannelListHooks.refresh()
    }

    private val resetOwner get() = "$name:reset"

    /** Undoes the "muted" dimming on rows bound after the plugin was turned off. */
    private val resetDimming = object : ChannelListHooks.RowDecorator {
        override fun text(item: ChannelListItemTextChannel, binding: WidgetChannelsListItemChannelBinding) {
            if (binding.a.alpha == HIDDEN_ALPHA) binding.a.alpha = 1f
        }

        override fun voice(item: ChannelListItemVoiceChannel, binding: WidgetChannelsListItemChannelVoiceBinding) {
            if (binding.a.alpha == HIDDEN_ALPHA) binding.a.alpha = 1f
        }
    }

    private fun decorate(row: android.view.View, icon: android.widget.ImageView, hidden: Boolean) {
        if (!hidden) {
            if (row.alpha == HIDDEN_ALPHA) row.alpha = 1f
            return
        }
        if (choice("showMode") == "muted") {
            row.alpha = HIDDEN_ALPHA
        } else {
            if (row.alpha == HIDDEN_ALPHA) row.alpha = 1f
            icon.setImageResource(R.e.ic_role_lock)
        }
    }

    internal companion object {
        const val VIEW_CHANNEL = 1L shl 10
        private const val HIDDEN_ALPHA = 0.55f

        /** Whether [channel] is a server channel the user cannot view. */
        @JvmStatic
        fun isHidden(channel: Channel): Boolean {
            if (channel.guildId == 0L || channel.type == Channel.CATEGORY) return false
            val perms = StoreStream.getPermissions().permissionsByChannel[channel.id] ?: return false
            return !PermissionUtils.can(VIEW_CHANNEL, perms)
        }
    }
}
