/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.cleanchannelname

import android.content.Context
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.discord.api.channel.Channel
import com.discord.api.channel.ChannelUtils
import com.endcord.plugins.guildscommon.ChannelListHooks
import com.endcord.plugins.guildscommon.GuildsPlugin
import de.robv.android.xposed.XC_MethodHook
import java.text.Normalizer
import java.util.concurrent.ConcurrentHashMap
import java.util.regex.Pattern

internal class CleanChannelName : GuildsPlugin(
    name = "CleanChannelName",
    description = "Remove emoji and decoration from channel names. Reverts to the original while you're editing the channel.",
) {
    override val tags = listOf("appearance", "servers")

    @Volatile private var editing = 0

    override fun start(context: Context) {
        // ChannelUtils.c is how the app turns a channel into the name it shows, everywhere.
        patcher.patch(ChannelUtils::class.java.getDeclaredMethod("c", Channel::class.java), object : XC_MethodHook() {
            override fun afterHookedMethod(param: MethodHookParam) {
                if (editing > 0) return
                val channel = param.args[0] as? Channel ?: return
                val name = param.result as? String ?: return
                if (channel.guildId == 0L || name.isEmpty()) return
                try {
                    param.result = clean(name, channel.type)
                } catch (e: Throwable) {
                    logger.error("Failed to clean a channel name", e)
                }
            }
        })

        // The channel settings pages fill in the name to edit with the same method: show the real name there.
        val editFlag = object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                editing++
            }

            override fun afterHookedMethod(param: MethodHookParam) {
                editing--
            }
        }
        for (className in EDIT_PAGES) {
            try {
                val cls = Class.forName(className)
                cls.declaredMethods.filter { it.name == "configureUI" }.forEach { patcher.patch(it, editFlag) }
            } catch (e: Throwable) {
                logger.error("Couldn't find $className", e)
            }
        }
        ChannelListHooks.rebind()
    }

    override fun stop(context: Context) {
        super.stop(context)
        cache.clear()
        ChannelListHooks.rebind()
    }

    private companion object {
        val EDIT_PAGES = arrayOf(
            "com.discord.widgets.channels.settings.WidgetTextChannelSettings",
            "com.discord.widgets.voice.settings.WidgetVoiceChannelSettings",
        )

        val SMALL_CAPS = mapOf(
            'ᴀ' to 'a', 'ʙ' to 'b', 'ᴄ' to 'c', 'ᴅ' to 'd', 'ᴇ' to 'e', 'ꜰ' to 'f', 'ɢ' to 'g', 'ʜ' to 'h', 'ɪ' to 'i',
            'ᴊ' to 'j', 'ᴋ' to 'k', 'ʟ' to 'l', 'ᴍ' to 'm', 'ɴ' to 'n', 'ᴏ' to 'o', 'ᴘ' to 'p', 'ǫ' to 'q', 'ʀ' to 'r',
            'ꜱ' to 's', 'ᴛ' to 't', 'ᴜ' to 'u', 'ᴠ' to 'v', 'ᴡ' to 'w', 'ʏ' to 'y', 'ᴢ' to 'z',
        )
        val BAR: Pattern = Pattern.compile("-?\\|-?")
        val DECORATION: Pattern = Pattern.compile("-?[^\\p{L} -~]-?")
        val DASHES: Pattern = Pattern.compile("-+")
        val EDGES: Pattern = Pattern.compile("(^-|-$)")

        val cache = ConcurrentHashMap<String, String>()

        /** Same steps as Endcord PC, with emoji detected by code point range (no Extended_Pictographic on API 24). */
        fun clean(name: String, type: Int): String {
            val key = "$type:$name"
            cache[key]?.let { return it }

            val separator = if (type == Channel.GUILD_VOICE || type == Channel.CATEGORY) " " else "-"
            val normalized = Normalizer.normalize(name, Normalizer.Form.NFKC)
            val sb = StringBuilder(normalized.length)
            for (c in normalized) sb.append(SMALL_CAPS[c] ?: c)

            var text = removeEmoji(sb.toString())
            text = BAR.matcher(text).replaceAll(separator)
            text = DECORATION.matcher(text).replaceAll(separator)
            text = DASHES.matcher(text).replaceAll("-")
            text = EDGES.matcher(text).replaceAll("")
            val result = text.trim().ifEmpty { name }

            if (cache.size > 2000) cache.clear()
            cache[key] = result
            return result
        }

        /** Removes emoji and the one non-ASCII character next to them on each side, like PC's `[^ -~]?\p{Extended_Pictographic}[^ -~]?`. */
        private fun removeEmoji(text: String): String {
            val cps = IntArray(text.codePointCount(0, text.length))
            var offset = 0
            for (i in cps.indices) {
                cps[i] = text.codePointAt(offset)
                offset += Character.charCount(cps[i])
            }
            val remove = BooleanArray(cps.size)
            for (i in cps.indices) {
                if (!isPictographic(cps[i])) continue
                remove[i] = true
                if (i > 0 && !isAscii(cps[i - 1])) remove[i - 1] = true
                if (i + 1 < cps.size && !isAscii(cps[i + 1])) remove[i + 1] = true
            }
            val sb = StringBuilder(text.length)
            for (i in cps.indices) if (!remove[i]) sb.appendCodePoint(cps[i])
            return sb.toString()
        }

        private fun isAscii(cp: Int) = cp in 0x20..0x7E

        private fun isPictographic(cp: Int) = cp in 0x1F000..0x1FAFF || cp in 0x2600..0x27BF || cp in 0x2300..0x23FF ||
            cp in 0x2B00..0x2BFF || cp in 0x1FC00..0x1FFFD || cp == 0x00A9 || cp == 0x00AE || cp == 0x203C ||
            cp == 0x2049 || cp == 0x2122 || cp == 0x2139 || cp in 0x2194..0x21AA || cp == 0x24C2 || cp in 0x25AA..0x25FE ||
            cp == 0x3030 || cp == 0x303D || cp == 0x3297 || cp == 0x3299
    }
}
