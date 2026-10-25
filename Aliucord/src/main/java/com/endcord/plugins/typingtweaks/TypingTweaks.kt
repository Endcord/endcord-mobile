/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.typingtweaks

import android.content.Context
import android.content.res.Resources
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.discord.models.member.GuildMember
import com.discord.models.user.User
import com.discord.widgets.chat.overlay.WidgetChatOverlay
import com.endcord.plugins.identitycommon.Members
import de.robv.android.xposed.XC_MethodHook

/**
 * The typing indicator on Android only gets the typing users' names. Their colors are taken where the app turns
 * users into names (`ChatTypingModel.getTypingUsers`), then applied to the names in the finished text.
 */
internal class TypingTweaks : EndcordPlugin(
    name = "TypingTweaks",
    description = "Show role colours in the typing indicator",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "customisation")

    override val settingsSchema = listOf(
        PluginSetting.Switch("showRoleColors", "Show role colors in the typing indicator", default = true),
        PluginSetting.Switch("alternativeFormatting", "Show a more useful message when several users are typing", default = true),
    )

    // Name shown in the indicator -> role color, written on an Rx thread and read on the main thread
    @Volatile
    private var colors: Map<String, Int> = emptyMap()

    override fun start(context: Context) {
        val namesFunc = Class.forName("com.discord.widgets.chat.overlay.ChatTypingModel\$Companion\$getTypingUsers\$1\$1")
        patcher.patch(namesFunc.getDeclaredMethod("call", Map::class.java, Map::class.java), object : XC_MethodHook() {
            override fun afterHookedMethod(param: MethodHookParam) {
                try {
                    @Suppress("UNCHECKED_CAST")
                    val users = param.args[0] as Map<Long, User>? ?: return
                    @Suppress("UNCHECKED_CAST")
                    val members = param.args[1] as Map<Long, GuildMember>? ?: emptyMap()
                    val result = HashMap<String, Int>()
                    for (user in users.values) {
                        val member = members[user.id] ?: continue
                        val color = Members.roleColor(member) ?: continue
                        result[GuildMember.getNickOrUsername(member, user)] = color or 0xFF000000.toInt()
                    }
                    colors = result
                } catch (e: Throwable) {
                    logger.error("Failed to read typing users' colors", e)
                }
            }
        })

        patcher.patch(
            WidgetChatOverlay.TypingIndicatorViewHolder::class.java.getDeclaredMethod("getTypingString", Resources::class.java, List::class.java),
            object : XC_MethodHook() {
                override fun afterHookedMethod(param: MethodHookParam) {
                    try {
                        @Suppress("UNCHECKED_CAST")
                        val names = (param.args[1] as List<CharSequence>?)?.map { it.toString() } ?: return
                        if (names.isEmpty()) return
                        val text: SpannableStringBuilder
                        if (names.size > 3 && bool("alternativeFormatting")) {
                            text = SpannableStringBuilder(I18n.t(
                                "{names} and {count} others are typing...",
                                "names" to "${names[0]}, ${names[1]}",
                                "count" to (names.size - 2).toString(),
                            ))
                            boldNames(text, names.subList(0, 2))
                        } else {
                            text = SpannableStringBuilder(param.result as CharSequence? ?: return)
                        }
                        if (bool("showRoleColors")) colorNames(text, names)
                        param.result = text
                    } catch (e: Throwable) {
                        logger.error("Failed to style the typing indicator", e)
                    }
                }
            },
        )
    }

    private fun boldNames(text: SpannableStringBuilder, names: List<String>) {
        var from = 0
        for (name in names) {
            val start = text.indexOf(name, from)
            if (start < 0) continue
            text.setSpan(StyleSpan(android.graphics.Typeface.BOLD), start, start + name.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            from = start + name.length
        }
    }

    private fun colorNames(text: SpannableStringBuilder, names: List<String>) {
        val colors = colors
        if (colors.isEmpty()) return
        var from = 0
        for (name in names) {
            val start = text.indexOf(name, from)
            if (start < 0) continue
            from = start + name.length
            val color = colors[name] ?: continue
            text.setSpan(ForegroundColorSpan(color), start, start + name.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
    }

    override fun stop(context: Context) {
        colors = emptyMap()
        super.stop(context)
    }
}
