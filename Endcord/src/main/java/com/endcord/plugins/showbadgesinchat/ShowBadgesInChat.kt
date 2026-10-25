/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.showbadgesinchat

import android.content.Context
import android.text.SpannableStringBuilder
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.discord.api.premium.PremiumTier
import com.discord.stores.StoreStream
import com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage
import com.discord.widgets.chat.list.entries.MessageEntry
import com.endcord.plugins.api.ChatDecorator
import com.endcord.plugins.api.ChatHooks
import com.endcord.plugins.identitycommon.Header
import com.endcord.plugins.identitycommon.Icons
import com.endcord.plugins.identitycommon.RemoteImages
import com.lytefast.flexinput.R

internal class ShowBadgesInChat : EndcordPlugin(
    name = "ShowBadgesInChat",
    description = "Shows the message author's badges beside their name in chat.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "chat")

    override val settingsSchema = listOf(
        PluginSetting.Switch("showEndcordContributor", "Show Endcord contributor badges", default = true),
        PluginSetting.Switch(
            "showDiscordProfile",
            "Show Discord profile badges",
            "HypeSquad, Discord Staff, Early Supporter, etc.",
            default = true,
        ),
        PluginSetting.Switch("showDiscordNitro", "Show the Nitro badge", default = true),
    )

    private val decorator = object : ChatDecorator(name, priority = 64) {
        override fun afterConfigure(holder: WidgetChatListAdapterItemMessage, entry: MessageEntry) {
            val author = entry.message.author ?: return
            val view = Header.timestamp(holder) ?: return
            val builder = SpannableStringBuilder()

            if (bool("showEndcordContributor") && author.id in CONTRIBUTORS && !RemoteImages.failed(CONTRIBUTOR_BADGE)) {
                val size = Icons.sizeFor(view, 1.25f)
                builder.append(Icons.span(RemoteImages.drawable(CONTRIBUTOR_BADGE, size, view), (view.textSize * 0.08f).toInt()))
            }

            if (bool("showDiscordProfile")) {
                val flags = author.n() ?: author.h() ?: 0
                if (flags != 0) for (i in FLAG_BITS.indices) {
                    if (flags and (1 shl FLAG_BITS[i]) != 0) Icons.append(builder, view, FLAG_ICONS[i], null, 1.25f)
                }
            }

            if (bool("showDiscordNitro") && hasNitro(author.id, author.m())) {
                Icons.append(builder, view, R.e.ic_profile_badge_nitro_32dp, null, 1.25f)
            }

            if (builder.isEmpty()) return
            Header.prepend(holder, builder.append(' '))
        }
    }

    /**
     * Discord only tells clients about another user's Nitro when their profile was loaded, which fills in the
     * user store. Message authors carry it only for yourself.
     */
    private fun hasNitro(userId: Long, fromMessage: PremiumTier?): Boolean {
        val tier = StoreStream.getUsers().users[userId]?.premiumTier ?: fromMessage
        return tier != null && tier != PremiumTier.NONE && tier != PremiumTier.PREMIUM_GUILD_SUBSCRIPTION_ONLY
    }

    override fun start(context: Context) {
        ChatHooks.register(decorator)
    }

    override fun stop(context: Context) {
        ChatHooks.unregisterAll(name)
        super.stop(context)
    }

    private companion object {
        /** Endcord PC's DevsById, the people whose badge PC shows as "Endcord Contributor". */
        val CONTRIBUTORS = setOf(1390609041897554050L, 1097880625513496586L, 904384828143706164L, 1374807824479162369L)
        const val CONTRIBUTOR_BADGE = "https://iili.io/C3jZGrg.th.png"

        /** Public flag bits, in Endcord PC's order, and the app's own icon for each. */
        val FLAG_BITS = intArrayOf(0, 1, 2, 6, 7, 8, 3, 14, 17, 9, 18)
        val FLAG_ICONS = intArrayOf(
            R.e.ic_profile_badge_staff_32dp,
            R.e.ic_profile_badge_partner_32dp,
            R.e.ic_profile_badge_hypesquad_32dp,
            R.e.ic_hypesquad_house1_32dp,
            R.e.ic_hypesquad_house2_32dp,
            R.e.ic_hypesquad_house3_32dp,
            R.e.ic_profile_badge_bughunter_level_1_32dp,
            R.e.ic_profile_badge_bughunter_level_2_32dp,
            R.e.ic_profile_badge_verified_developer_32dp,
            R.e.ic_profile_badge_premium_early_supporter_32dp,
            R.e.ic_profile_badge_certified_moderator_32dp,
        )
    }
}
