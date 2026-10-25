/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.voicecount

import android.content.Context
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.widget.TextView
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.after
import com.aliucord.wrappers.ChannelWrapper.Companion.userLimit
import com.discord.databinding.WidgetChannelsListItemChannelVoiceBinding
import com.discord.utilities.color.ColorCompat
import com.discord.widgets.channels.list.WidgetChannelsListAdapter
import com.discord.widgets.channels.list.items.ChannelListItem
import com.discord.widgets.channels.list.items.ChannelListItemVoiceChannel
import com.lytefast.flexinput.R
import java.lang.reflect.Field

internal class VoiceCount : EndcordPlugin(
    name = "VoiceCount",
    description = "Shows how many people are sitting in each voice channel, right next to it in the channel list.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("voice", "servers")

    override val settingsSchema = listOf(
        PluginSetting.Switch("hideEmpty", "Hide the number on empty channels.", default = true),
    )

    private val bindingField: Field by lazy {
        WidgetChannelsListAdapter.ItemChannelVoice::class.java.getDeclaredField("binding").apply { isAccessible = true }
    }

    override fun start(context: Context) {
        patcher.after<WidgetChannelsListAdapter.ItemChannelVoice>(
            "onConfigure",
            Int::class.javaPrimitiveType!!,
            ChannelListItem::class.java,
        ) { param ->
            try {
                val item = param.args[1] as? ChannelListItemVoiceChannel ?: return@after
                // Channels with a user limit already show "count/limit" in Discord's own pill
                if (item.channel.userLimit > 0) return@after
                val count = item.numUsersConnected
                if (count == 0 && bool("hideEmpty")) return@after
                val binding = bindingField[this] as WidgetChannelsListItemChannelVoiceBinding
                val nameView: TextView = binding.f
                val text = SpannableStringBuilder(nameView.text).append("  ")
                val start = text.length
                text.append(count.toString())
                text.setSpan(
                    ForegroundColorSpan(ColorCompat.getThemedColor(nameView.context, R.b.colorTextMuted)),
                    start,
                    text.length,
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
                )
                text.setSpan(RelativeSizeSpan(0.85f), start, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                nameView.text = text
            } catch (e: Throwable) {
                logger.error("Failed to show the voice count", e)
            }
        }
    }
}
