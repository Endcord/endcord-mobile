/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.chatgptwriting

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.composercommon.OutgoingMessages
import java.util.regex.Pattern
import kotlin.random.Random

/** Despite the name this runs entirely on the device, like on Endcord PC: no API key, nothing is sent anywhere. */
internal class ChatGPTWriting : ComposerPlugin(
    name = "ChatGPTWriting",
    description = "Enhance your messages with kaomoji, emoji, and autocorrect",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            "isEnabled",
            "Enable ChatGPT Writing plugin",
            "Also available from the long-press menu of the send button",
            default = false,
        ),
        PluginSetting.Switch("useKaomoji", "Add a kaomoji at the end of your messages", default = false),
        PluginSetting.Switch("useEmoji", "Add an emoji at the end of your messages (matching message tone)", default = false),
        PluginSetting.Switch("autocorrect", "Automatically fix grammar and punctuation", default = false),
    )

    override fun start(context: Context) {
        composerAction("ChatGPT Writing", checked = { bool("isEnabled") }) {
            val enabled = !bool("isEnabled")
            settings.setBool("isEnabled", enabled)
            Utils.showToast(I18n.t(if (enabled) "ChatGPT Writing (ON)" else "ChatGPT Writing (OFF)"))
        }

        onOutgoing(OutgoingMessages.Priority.STYLE + 20) { message ->
            if (!bool("isEnabled") || message.content.contains("```")) return@onOutgoing
            var content = message.content.trim()
            if (content.isEmpty()) return@onOutgoing

            val tone = detectTone(content)
            if (bool("autocorrect")) content = autocorrect(content)
            if (bool("useKaomoji")) content += " " + (KAOMOJIS[tone] ?: KAOMOJIS.getValue("default")).random()
            if (bool("useEmoji")) content += " " + (EMOJIS[tone] ?: EMOJIS.getValue("default")).random()
            message.content = content
        }
    }

    private fun <T> List<T>.random(): T = this[Random.nextInt(size)]

    private fun detectTone(content: String): String {
        for ((tone, pattern) in TONES) if (pattern.matcher(content).find()) return tone
        return "default"
    }

    private fun autocorrect(content: String): String {
        var corrected = content
        for ((wrong, pattern) in REPLACEMENT_PATTERNS) {
            corrected = pattern.matcher(corrected).replaceAll(java.util.regex.Matcher.quoteReplacement(WORD_REPLACEMENTS.getValue(wrong)))
        }
        if (corrected.isNotEmpty() && corrected[0].let { it in 'a'..'z' || it in 'A'..'Z' }) {
            corrected = corrected[0].uppercaseChar() + corrected.substring(1)
        }
        if (corrected.isNotEmpty() && corrected.trim().lastOrNull()?.let { it in ".!?" } != true) {
            corrected = corrected.trim() + "."
        }
        val matcher = SENTENCE_START.matcher(corrected)
        val out = StringBuffer()
        while (matcher.find()) matcher.appendReplacement(out, "${matcher.group(1)} ${matcher.group(2)!!.uppercase()}")
        matcher.appendTail(out)
        return out.toString()
    }

    private companion object {
        val KAOMOJIS = mapOf(
            "happy" to listOf("ヽ(´▽`)/", "<(￣︶￣)>", "o(≧▽≦)o", "(─‿‿─)♡", "(*≧ω≦*)"),
            "sad" to listOf("ಥ_ಥ", "(´・ω・`)", "(╥_╥)", "｡ﾟ･ (>﹏<) ･ﾟ｡", "(ノ_<。)"),
            "angry" to listOf("ヽ(｀Д´)ﾉ", "ヽ(ｏ`皿′ｏ)ﾉ", "(╬ Ò﹏Ó)", "┌∩┐(◣_◢)┌∩┐", "┻━┻ ︵ヽ(`Д´)ﾉ︵ ┻━┻"),
            "confused" to listOf("(•ิ_•ิ)?", "(◎_◎;)", "(－ω－)", "(・_・ヂ", "(?_?)"),
            "loving" to listOf("(⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)", "ღゝ◡╹)ノ♡", "♥‿♥", "(´∀`)♡", "(◕‿◕)♡"),
            "smug" to listOf("ಠ_ಠ", "(￣ー￣)", "(~_~)", "(↼_↼)", "¬_¬"),
            "excited" to listOf("(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧", "✌(◕‿-)✌", "(≧◡≦)", "o(*≧▽≦)o", "ヾ(^▽^*)"),
            "sleepy" to listOf("(ᴗ_ᴗ)", "(－ω－) zzZ", "(。-ω-)zzz", "(-.-)Zzz...", "(˘ω˘)"),
            "crying" to listOf("(ಥ﹏ಥ)", "o(╥﹏╥)o", "(;_;)", "(ノ_<。)", "(T_T)"),
            "default" to listOf("(◕‿◕)", "( ˘ᴗ˘ )", "(｡•̀ᴗ-)✧", "(*ᴗ͈ˬᴗ͈)", "( ˘◡˘ )"),
        )

        val EMOJIS = mapOf(
            "happy" to listOf("😊", "😄", "🥰", "✨", "💕"),
            "sad" to listOf("😢", "💔", "😞", "🥺", "💧"),
            "angry" to listOf("😠", "😤", "💢", "🔥", "😡"),
            "confused" to listOf("😕", "🤔", "😵‍💫", "❓", "😬"),
            "loving" to listOf("🥰", "💕", "😍", "❤️", "💖"),
            "smug" to listOf("😏", "😌", "😎", "😼", "💅"),
            "excited" to listOf("🎉", "🤩", "🙌", "💯", "🔥"),
            "sleepy" to listOf("😴", "💤", "😪", "🥱", "😇"),
            "crying" to listOf("😭", "😿", "💔", "🥺", "😩"),
            "default" to listOf("✨", "👍", "❤️", "😊", "💫"),
        )

        /** Checked in this order, the first match wins, like on Endcord PC. */
        val TONES = listOf(
            "happy" to "happy|glad|excited|love|amazing|awesome|great|wonderful|fantastic|joy|yay|woohoo",
            "sad" to "sad|cry|tears|miss|lonely|unhappy|upset|depressed|unfortunately|sorry",
            "angry" to "angry|mad|furious|hate|annoying|stupid|idiot|worst|rage",
            "confused" to "confused|confusing|what|why|how|question|don't understand",
            "loving" to "love|love you|love you so much|crush|heart|valentine|babe",
            "smug" to "satisfy|proud|nice|perfect|better|well|obviously|of course",
            "excited" to "excited|wow|omg|holy|amazing|incredible|can't wait|soon",
            "sleepy" to "tired|sleepy|exhausted|sleep|bed|goodnight|night|zzz",
            "crying" to "cry|crying|sob|tears|sobs",
        ).map { (tone, words) -> tone to Pattern.compile("\\b($words)\\b", Pattern.CASE_INSENSITIVE) }

        val WORD_REPLACEMENTS = linkedMapOf(
            "teh" to "the", "thier" to "their", "recieve" to "receive", "occured" to "occurred",
            "seperate" to "separate", "definately" to "definitely", "accomodate" to "accommodate",
            "occurence" to "occurrence", "untill" to "until", "becuase" to "because", "writting" to "writing",
            "truely" to "truly", "happend" to "happened", "wierd" to "weird", "thats" to "that's",
            "dont" to "don't", "cant" to "can't", "wont" to "won't", "im" to "I'm", "ive" to "I've",
            "youre" to "you're", "theyre" to "they're", "were" to "we're", "shouldve" to "should've",
            "couldve" to "could've", "wouldve" to "would've", "doesnt" to "doesn't", "isnt" to "isn't",
            "wasnt" to "wasn't", "hasnt" to "hasn't", "havent" to "haven't", "hadnt" to "hadn't",
            "wouldnt" to "wouldn't", "couldnt" to "couldn't", "shouldnt" to "shouldn't", "didnt" to "didn't",
            "arent" to "aren't", "aint" to "ain't", "gonna" to "gon na", "wanna" to "want to",
            "gotta" to "got to", "kinda" to "kind of", "sorta" to "sort of", "outta" to "out of",
            "lemme" to "let me", "gimme" to "give me",
        )

        val REPLACEMENT_PATTERNS = WORD_REPLACEMENTS.keys.map { it to Pattern.compile("\\b$it\\b", Pattern.CASE_INSENSITIVE) }

        val SENTENCE_START: Pattern = Pattern.compile("([.!?])\\s+([a-z])")
    }
}
