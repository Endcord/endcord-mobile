/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.channelbadges

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ReplacementSpan
import android.widget.TextView
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.utils.DimenUtils
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.aliucord.wrappers.ChannelWrapper.Companion.nsfw
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.discord.api.channel.Channel
import com.discord.databinding.WidgetChannelsListItemChannelBinding
import com.discord.databinding.WidgetChannelsListItemChannelVoiceBinding
import com.discord.stores.StoreStream
import com.discord.widgets.channels.list.items.ChannelListItemTextChannel
import com.discord.widgets.channels.list.items.ChannelListItemVoiceChannel
import com.endcord.plugins.guildscommon.ChannelListHooks
import com.endcord.plugins.guildscommon.GuildsPlugin

internal class ChannelBadges : GuildsPlugin(
    name = "ChannelBadges",
    description = "Adds badges to channels based on their type",
) {
    override val tags = listOf("appearance", "servers")

    override val settingsSchema = listOf(
        PluginSetting.Switch("oneBadgePerChannel", "Show only one badge per channel"),
        PluginSetting.Switch("showTextBadge", "Show Text badge", default = true),
        PluginSetting.Switch("showVoiceBadge", "Show Voice badge", default = true),
        PluginSetting.Switch("showAnnouncementBadge", "Show Announcement badge", default = true),
        PluginSetting.Switch("showForumBadge", "Show Forum badge", default = true),
        PluginSetting.Switch("showNSFWBadge", "Show NSFW badge", default = true),
        PluginSetting.Switch("showLockedBadge", "Show Locked badge", default = true),
        PluginSetting.Switch("showRulesBadge", "Show Rules badge", default = true),
    )

    override fun onSettingChanged(key: String) = ChannelListHooks.rebind()

    override fun start(context: Context) {
        ChannelListHooks.registerDecorator(name, object : ChannelListHooks.RowDecorator {
            override fun text(item: ChannelListItemTextChannel, binding: WidgetChannelsListItemChannelBinding) {
                addBadges(binding.e, item.channel, item.isLocked)
            }

            override fun voice(item: ChannelListItemVoiceChannel, binding: WidgetChannelsListItemChannelVoiceBinding) {
                addBadges(binding.f, item.channel, item.isLocked)
            }
        }, priority = 100)
        ChannelListHooks.rebind()
    }

    override fun stop(context: Context) {
        super.stop(context)
        ChannelListHooks.rebind()
    }

    private class Badge(val label: String, val color: Int)

    private fun badgesFor(channel: Channel, locked: Boolean): List<Badge> {
        val out = ArrayList<Badge>(3)
        val rules = StoreStream.getGuilds().getGuild(channel.guildId)?.rulesChannelId == channel.id
        when (channel.type) {
            Channel.GUILD_TEXT -> if (rules && bool("showRulesBadge")) out += Badge("Rules", GREEN)
                else if (bool("showTextBadge")) out += Badge("Text", BLURPLE)
            Channel.GUILD_VOICE -> if (bool("showVoiceBadge")) out += Badge("Voice", BLURPLE)
            Channel.GUILD_ANNOUNCEMENT -> if (bool("showAnnouncementBadge")) out += Badge("News", BLURPLE)
            Channel.GUILD_FORUM -> if (bool("showForumBadge")) out += Badge("Forum", BLURPLE)
        }
        if (channel.nsfw && bool("showNSFWBadge")) out += Badge("NSFW", RED)
        if (locked && bool("showLockedBadge")) out += Badge("Locked", GREY)
        if (bool("oneBadgePerChannel") && out.size > 1) return listOf(out.last())
        return out
    }

    private fun addBadges(name: TextView, channel: Channel, locked: Boolean) {
        val badges = badgesFor(channel, locked)
        if (badges.isEmpty()) return
        val text = SpannableStringBuilder(name.text)
        for (badge in badges) {
            text.append(' ')
            val start = text.length
            text.append(I18n.t(badge.label))
            text.setSpan(BadgeSpan(badge.color), start, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        name.text = text
    }

    /** A small rounded label drawn in place of its text. */
    private class BadgeSpan(private val color: Int) : ReplacementSpan() {
        private val padding = DimenUtils.dpToPx(4).toFloat()
        private val radius = DimenUtils.dpToPx(4).toFloat()

        override fun getSize(paint: Paint, text: CharSequence, start: Int, end: Int, fm: Paint.FontMetricsInt?): Int {
            val old = paint.textSize
            paint.textSize = old * SCALE
            val width = paint.measureText(text, start, end)
            paint.textSize = old
            return (width + padding * 2 + padding).toInt()
        }

        override fun draw(canvas: Canvas, text: CharSequence, start: Int, end: Int, x: Float, top: Int, y: Int, bottom: Int, paint: Paint) {
            val oldSize = paint.textSize
            val oldColor = paint.color
            paint.textSize = oldSize * SCALE
            val width = paint.measureText(text, start, end)
            val metrics = paint.fontMetrics
            val height = metrics.descent - metrics.ascent
            val centerY = (top + bottom) / 2f
            val rect = RectF(x + padding / 2, centerY - height / 2, x + padding / 2 + width + padding * 2, centerY + height / 2)
            paint.color = color
            canvas.drawRoundRect(rect, radius, radius, paint)
            paint.color = 0xFFFFFFFF.toInt()
            canvas.drawText(text, start, end, rect.left + padding, centerY - (metrics.ascent + metrics.descent) / 2, paint)
            paint.textSize = oldSize
            paint.color = oldColor
        }
    }

    private companion object {
        const val SCALE = 0.75f
        const val BLURPLE = 0xFF5865F2.toInt()
        const val GREEN = 0xFF3BA55C.toInt()
        const val RED = 0xFFED4245.toInt()
        const val GREY = 0xFF747F8D.toInt()
    }
}
