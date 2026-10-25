/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.morecommands

import android.app.ActivityManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.SystemClock
import com.aliucord.Utils
import com.aliucord.api.CommandsAPI
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.CommandContext
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.tr
import com.endcord.plugins.commandscommon.BotMessages
import com.endcord.plugins.commandscommon.Net
import com.endcord.plugins.commandscommon.Options
import com.endcord.plugins.commandscommon.OutgoingMessages
import java.text.DateFormat
import java.text.Normalizer
import java.util.Date
import java.util.Locale
import java.util.regex.Pattern
import kotlin.random.Random

internal class MoreCommands : EndcordPlugin(
    name = "MoreCommands",
    description = "Adds various fun and useful commands",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("commands", "fun")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            key = "addFreakyEnding",
            label = "Freaky ending",
            description = "Add 👅 or ❤️ at the end",
        ),
        PluginSetting.Switch(
            key = "uwuEveryMessage",
            label = "Uwuify every message",
            description = "Make every single message uwuified",
        ),
    )

    /** Pending countdown steps, cancelled when the plugin stops. */
    private val pending = ArrayList<Runnable>()

    private val whitespace = Pattern.compile("\\s+")

    override fun start(context: Context) {
        registerInfoCommands()
        registerRandomCommands()
        registerTextCommands()
        registerKaomoji()
        OutgoingMessages.register(name) { text ->
            if (bool("uwuEveryMessage") && text.isNotBlank()) TextFx.uwuify(text) else text
        }
    }

    override fun stop(context: Context) {
        OutgoingMessages.unregisterAll(name)
        synchronized(pending) {
            for (r in pending) Utils.mainThread.removeCallbacks(r)
            pending.clear()
        }
        super.stop(context)
    }

    private fun reply(content: String) = CommandResult(content, null, false)
    private fun send(content: String) = CommandResult(content, null, true)

    /** Joins an optional message and a suffix the way the PC commands do, without a leading space. */
    private fun withMessage(ctx: CommandContext, suffix: String): String {
        val message = ctx.getStringOrDefault("message", "").trim()
        return if (message.isEmpty()) suffix else "$message $suffix"
    }

    private fun registerInfoCommands() {
        commands.registerCommand("systeminfo", "Shows system information") { ctx ->
            try {
                send(systemInfo(ctx.context))
            } catch (e: Throwable) {
                logger.error("Failed to read system information", e)
                reply(tr("Failed to fetch system information"))
            }
        }

        commands.registerCommand("getuptime", "Returns the system uptime") {
            val minutes = SystemClock.elapsedRealtime() / 60_000
            send("> **${tr("System Uptime")}**: ${tr("{count} minutes", "count" to minutes)}")
        }

        commands.registerCommand("gettime", "Returns the current server time") {
            val time = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.MEDIUM, Locale.getDefault()).format(Date())
            send("> **${tr("Current Time")}**: $time")
        }

        commands.registerCommand("ping", "Pings the bot to check if it's responding") {
            reply(tr("Pong!"))
        }

        commands.registerCommand("wordcount", "Counts the number of words in a message", CommandsAPI.requiredMessageOption) { ctx ->
            val message = ctx.getRequiredString("message").trim()
            val count = if (message.isEmpty()) 0 else whitespace.split(message).size
            reply(tr("The message contains {count} words.", "count" to count))
        }

        commands.registerCommand(
            "countdown",
            "Starts a countdown from a specified number",
            listOf(Options.integer("number", "Number to countdown from (max 10)", required = true)),
        ) { ctx ->
            val number = ctx.getRequiredInt("number").coerceAtMost(10)
            if (number < 1) return@registerCommand reply(tr("Please provide a valid number between 1 and 10!"))
            val channelId = ctx.channelId
            for (i in number downTo 0) {
                val step = object : Runnable {
                    override fun run() {
                        synchronized(pending) { pending.remove(this) }
                        BotMessages.send(channelId, if (i == 0) "🎉 ${tr("Go!")} 🎉" else "$i...")
                    }
                }
                synchronized(pending) { pending += step }
                Utils.mainThread.postDelayed(step, (number - i + 1) * 1000L)
            }
            reply(tr("Starting countdown from {number}...", "number" to number))
        }
    }

    private fun systemInfo(context: Context): String {
        val res = context.resources
        val metrics = res.displayMetrics
        val memory = ActivityManager.MemoryInfo().also {
            context.getSystemService(ActivityManager::class.java)?.getMemoryInfo(it)
        }
        val locales = res.configuration.locales
        val languages = (0 until locales.size()).joinToString(", ") { locales[it].toLanguageTag() }
        val deviceType = if (res.configuration.smallestScreenWidthDp >= 600) tr("Tablet") else tr("Mobile")

        val connectivity = context.getSystemService(ConnectivityManager::class.java)
        val caps = connectivity?.activeNetwork?.let { connectivity.getNetworkCapabilities(it) }
        val network = when {
            caps == null -> tr("Unknown")
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> tr("Cellular")
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "VPN"
            else -> tr("Unknown")
        }
        val online = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true

        return listOf(
            "> **${tr("Platform")}**: Android ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})",
            "> **${tr("Device Type")}**: $deviceType",
            "> **${tr("Device")}**: ${Build.MANUFACTURER} ${Build.MODEL}",
            "> **${tr("CPU Cores")}**: ${Runtime.getRuntime().availableProcessors()}",
            "> **${tr("Memory")}**: ${String.format(Locale.ROOT, "%.1f", memory.totalMem / 1073741824.0)}GB",
            "> **${tr("Screen")}**: ${metrics.widthPixels}x${metrics.heightPixels} (${metrics.densityDpi} dpi)",
            "> **${tr("Languages")}**: $languages",
            "> **${tr("Network")}**: $network (${if (online) tr("Online") else tr("Offline")})",
        ).joinToString("\n")
    }

    private fun registerRandomCommands() {
        commands.registerCommand(
            "choose",
            "Randomly chooses from provided options",
            listOf(Options.string("choices", "Comma-separated list of choices", required = true)),
        ) { ctx ->
            val choices = ctx.getRequiredString("choices").split(',').map { it.trim() }.filter { it.isNotEmpty() }
            if (choices.isEmpty()) reply(tr("Give me at least one choice."))
            else send(tr("I choose: {choice}", "choice" to choices.random()))
        }

        commands.registerCommand(
            "rolldice",
            "Roll a die with the specified number of sides",
            listOf(Options.integer("sides", "How many sides the die has", required = true)),
        ) { ctx ->
            val sides = ctx.getRequiredInt("sides")
            if (sides < 1) reply(tr("Please provide a valid number of sides."))
            else send(tr("You rolled a {roll}!", "roll" to Random.nextInt(sides) + 1))
        }

        commands.registerCommand("flipcoin", "Flips a coin and returns heads or tails") {
            val side = if (Random.nextBoolean()) tr("Heads") else tr("Tails")
            send(tr("The coin landed on: {side}", "side" to side))
        }

        val answers = arrayOf("Yes", "No", "Maybe", "Ask again later", "Definitely not", "It is certain")
        commands.registerCommand("ask", "Ask a yes/no question and get an answer", CommandsAPI.requiredMessageOption) { ctx ->
            send("${ctx.getRequiredString("message")} - ${tr(answers.random())}")
        }

        commands.registerCommand(
            "randomnumber",
            "Generates a random number between two values",
            listOf(
                Options.integer("min", "Minimum value", required = true),
                Options.integer("max", "Maximum value", required = true),
            ),
        ) { ctx ->
            var min = ctx.getRequiredLong("min")
            var max = ctx.getRequiredLong("max")
            if (min > max) min = max.also { max = min }
            val number = if (max == Long.MAX_VALUE) Random.nextLong(min, max) else Random.nextLong(min, max + 1)
            send(tr("Random number between {min} and {max}: {number}", "min" to min, "max" to max, "number" to number))
        }

        commands.registerCommand(
            "randomanimal",
            "Get a random cat picture",
            listOf(Options.string("animal", "pick your animal", required = true, choices = Options.choices("cat", "dog"))),
        ) { ctx ->
            val animal = ctx.getRequiredString("animal")
            try {
                val api = if (animal == "dog") "https://api.thedogapi.com/v1/images/search" else "https://api.thecatapi.com/v1/images/search"
                send(Net.getArray(api).getJSONObject(0).getString("url"))
            } catch (e: Throwable) {
                logger.warn("Failed to fetch a $animal picture", e)
                reply(
                    if (animal == "dog") tr("Sorry, couldn't fetch a dog picture right now 🐶")
                    else tr("Sorry, couldn't fetch a cat picture right now 😿")
                )
            }
        }

        commands.registerCommand("nekos", "Send Neko") {
            try {
                send(Net.getObject("https://nekos.best/api/v2/neko").getJSONArray("results").getJSONObject(0).getString("url"))
            } catch (e: Throwable) {
                logger.warn("Failed to fetch a neko", e)
                reply(tr("Couldn't fetch an image right now."))
            }
        }

        commands.registerCommand(
            "anime-boys",
            "Send cute anime boys",
            listOf(Options.bool("cat", "If set, this will send exclusively cute anime cat boys")),
        ) { ctx ->
            val sub = if (ctx.getBoolOrDefault("cat", false)) "animecatboys" else "cuteanimeboys"
            try {
                val posts = Net.getObject("https://www.reddit.com/r/$sub/top.json?limit=100&t=all")
                    .getJSONObject("data").getJSONArray("children")
                val url = posts.getJSONObject(Random.nextInt(posts.length())).getJSONObject("data").optString("url")
                if (url.isEmpty()) reply(tr("Couldn't fetch an image right now.")) else send(url)
            } catch (e: Throwable) {
                logger.warn("Failed to fetch r/$sub", e)
                reply(tr("Couldn't fetch an image right now."))
            }
        }
    }

    private fun registerTextCommands() {
        commands.registerCommand(
            "transform",
            "Transform your text with the specified option",
            listOf(
                Options.string("text", "TEXT TO UPPERCASE", required = true),
                Options.string(
                    "transformation", "transformation to apply to your text", required = true,
                    choices = Options.choices("toLowerCase", "toUpperCase", "toLocaleLowerCase", "toLocaleUpperCase") +
                        Utils.createCommandChoice("stay the same", "same"),
                ),
                Options.integer("repeat", "how many times to repeat"),
                Options.bool("reverse", "reverse your text"),
                Options.string("normalize", "which normalize option to use", choices = Options.choices("NFC", "NFD", "NFKC", "NFKD")),
            ),
        ) { ctx ->
            var text = ctx.getRequiredString("text")
            text = when (ctx.getRequiredString("transformation")) {
                "toLowerCase" -> text.lowercase()
                "toUpperCase" -> text.uppercase()
                "toLocaleLowerCase" -> text.lowercase(Locale.getDefault())
                "toLocaleUpperCase" -> text.uppercase(Locale.getDefault())
                else -> text
            }
            ctx.getString("normalize")?.let { form ->
                text = Normalizer.normalize(text, Normalizer.Form.valueOf(form))
            }
            if (ctx.getBoolOrDefault("reverse", false)) {
                val codePoints = text.codePoints().toArray()
                codePoints.reverse()
                text = String(codePoints, 0, codePoints.size)
            }
            // Keep the result within what one message can hold
            val maxRepeat = (4000 / text.length.coerceAtLeast(1)).coerceAtLeast(1)
            send(text.repeat(ctx.getIntOrDefault("repeat", 1).coerceIn(1, maxRepeat)))
        }

        commands.registerCommand("lenny", "Sends a lenny face", CommandsAPI.messageOption) { ctx ->
            send(withMessage(ctx, "( ͡° ͜ʖ ͡°)"))
        }

        commands.registerCommand("mock", "mOcK PeOpLe", CommandsAPI.requiredMessageOption) { ctx ->
            send(TextFx.mock(ctx.getRequiredString("message")))
        }

        commands.registerCommand(
            "slap",
            "Slap someone/something.",
            listOf(Options.string("victim", "Thing to slap", required = true)),
        ) { ctx ->
            send(tr("<@{me}> slaps {victim} around a bit with a large trout", "me" to ctx.me.id, "victim" to ctx.getRequiredString("victim")))
        }

        commands.registerCommand(
            "freaky",
            "it's freaky.",
            listOf(Options.string("message", "yoooo freaky", required = true)),
        ) { ctx ->
            send(TextFx.freaky(ctx.getRequiredString("message"), bool("addFreakyEnding")))
        }

        commands.registerCommand(
            "morse",
            "Translate to or from Morse code",
            listOf(Options.string("text", "Text to convert", required = true)),
        ) { ctx ->
            val input = ctx.getRequiredString("text")
            send(if (TextFx.isMorse(input)) TextFx.fromMorse(input) else TextFx.toMorse(input))
        }

        commands.registerCommand("uwuify", "uwuifies your messages", CommandsAPI.requiredMessageOption) { ctx ->
            send(TextFx.uwuify(ctx.getRequiredString("message")))
        }
    }

    private fun registerKaomoji() {
        val kaomoji = arrayOf(
            "dissatisfaction" to "＞﹏＜",
            "smug" to "ಠ_ಠ",
            "happy" to "ヽ(´▽`)/",
            "crying" to "ಥ_ಥ",
            "angry" to "ヽ(｀Д´)ﾉ",
            "anger" to "ヽ(ｏ`皿′ｏ)ﾉ",
            "joy" to "<(￣︶￣)>",
            "blush" to "૮ ˶ᵔ ᵕ ᵔ˶ ა",
            "confused" to "(•ิ_•ิ)?",
            "sleeping" to "(ᴗ_ᴗ)",
            "laughing" to "o(≧▽≦)o",
            "giving" to "(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧",
            "peace" to "✌(◕‿-)✌",
            "ending1" to "Ꮺ ָ࣪ ۰ ͙⊹",
            "uwu" to "(>⩊<)",
            "comfy" to "(─‿‿─)♡",
            "lovehappy" to "(*≧ω≦*)",
            "loveee" to "(⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)",
            "give" to "(ノ= ⩊ = )ノ",
            "lovegive" to "ღゝ◡╹)ノ♡",
            "music" to "(￣▽￣)/♫•¨•.¸¸♪",
            "stars" to ".𖥔 ݁ ˖๋ ࣭ ⭑",
            "lovegiving" to "⸜(｡˃ ᵕ ˂ )⸝♡",
        )
        for ((command, face) in kaomoji) {
            commands.registerCommand(command, face, CommandsAPI.messageOption) { ctx -> send(withMessage(ctx, face)) }
        }
    }
}
