/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.guildpickerdumper

import android.content.Context
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.tr
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.discord.stores.StoreStream
import com.endcord.plugins.commandscommon.BotMessages
import com.endcord.plugins.commandscommon.Net
import com.endcord.plugins.commandscommon.Options
import com.endcord.plugins.translatecommon.Downloads
import com.endcord.plugins.translatecommon.Rest
import org.json.JSONArray
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** `/dumpexpressions` downloads every emoji or sticker of the current server into one zip in Downloads/Endcord. */
internal class GuildPickerDumper : EndcordPlugin(
    name = "GuildPickerDumper",
    description = DESCRIPTION,
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("emotes", "servers", "utility")

    private class Asset(val url: String, val fallbackUrl: String?, val fileName: String)

    override fun start(context: Context) {
        commands.registerCommand(
            "dumpexpressions",
            "Download this server's emojis or stickers as a zip",
            listOf(Options.string("type", "What to download", true, Options.choices("emojis", "stickers"))),
        ) { ctx ->
            val guildId = StoreStream.getChannels().getChannel(ctx.channelId)?.guildId ?: 0L
            if (guildId == 0L) return@registerCommand CommandResult(tr("This only works in a server."), null, false)
            val stickers = ctx.getRequiredString("type") == "stickers"
            val guildName = StoreStream.getGuilds().getGuild(guildId)?.name ?: guildId.toString()

            val assets = try {
                if (stickers) stickers(guildId) else emojis(guildId)
            } catch (e: Throwable) {
                logger.error("Failed to list the server's expressions", e)
                return@registerCommand CommandResult(tr("Couldn't load the list: {reason}", "reason" to Net.describe(e)), null, false)
            }
            if (assets.isEmpty()) {
                return@registerCommand CommandResult(
                    tr(if (stickers) "This server has no stickers." else "This server has no emojis."), null, false,
                )
            }

            BotMessages.send(ctx.channelId, tr("Downloading {count} files...", "count" to assets.size))
            var saved = 0
            val failed = ArrayList<String>()
            val zipName = "${Downloads.safeName(guildName)}-${if (stickers) "stickers" else "emojis"}.zip"
            val where = try {
                Downloads.save(zipName, "application/zip") { out ->
                    ZipOutputStream(out).use { zip ->
                        val usedNames = HashSet<String>()
                        for (asset in assets) {
                            val bytes = download(asset)
                            if (bytes == null) {
                                failed += asset.fileName
                                continue
                            }
                            var name = asset.fileName
                            var i = 1
                            while (!usedNames.add(name)) name = "${i++}_${asset.fileName}"
                            zip.putNextEntry(ZipEntry(name))
                            zip.write(bytes)
                            zip.closeEntry()
                            saved++
                        }
                    }
                }
            } catch (e: Throwable) {
                logger.error("Failed to write the zip", e)
                return@registerCommand CommandResult(tr("Couldn't save the file: {reason}", "reason" to (e.message ?: e.toString())), null, false)
            }
            var result = tr("Saved {count} files to {path}", "count" to saved, "path" to where)
            if (failed.isNotEmpty()) result += "\n" + tr("Couldn't download: {names}", "names" to failed.joinToString(", "))
            CommandResult(result, null, false)
        }
    }

    private fun emojis(guildId: Long): List<Asset> {
        val arr = JSONArray(Rest.call("/guilds/$guildId/emojis"))
        val res = ArrayList<Asset>(arr.length())
        for (i in 0 until arr.length()) {
            val e = arr.getJSONObject(i)
            val id = e.optString("id")
            val ext = if (e.optBoolean("animated")) "gif" else "png"
            res += Asset("https://cdn.discordapp.com/emojis/$id.$ext?size=512&quality=lossless", null, "${clean(e.optString("name"))}_$id.$ext")
        }
        return res
    }

    private fun stickers(guildId: Long): List<Asset> {
        val arr = JSONArray(Rest.call("/guilds/$guildId/stickers"))
        val res = ArrayList<Asset>(arr.length())
        for (i in 0 until arr.length()) {
            val s = arr.getJSONObject(i)
            val id = s.optString("id")
            val name = clean(s.optString("name"))
            res += when (s.optInt("format_type")) {
                // Lottie stickers are JSON animations, served from discord.com
                3 -> Asset("https://discord.com/stickers/$id.json", null, "${name}_$id.json")
                4 -> Asset("https://media.discordapp.net/stickers/$id.gif?size=4096", null, "${name}_$id.gif")
                // APNG is served as .png; some only exist as gif
                2 -> Asset("https://media.discordapp.net/stickers/$id.png?size=4096&passthrough=true", "https://media.discordapp.net/stickers/$id.gif?size=4096", "${name}_$id.png")
                else -> Asset("https://media.discordapp.net/stickers/$id.png?size=4096", null, "${name}_$id.png")
            }
        }
        return res
    }

    private fun download(asset: Asset): ByteArray? {
        for (url in listOfNotNull(asset.url, asset.fallbackUrl)) {
            try {
                return Net.getBytes(url, 16 * 1024 * 1024)
            } catch (e: Throwable) {
                logger.warn("Failed to download $url: ${Net.describe(e)}")
            }
        }
        return null
    }

    private fun clean(name: String) = Downloads.safeName(name.ifEmpty { "unnamed" })

    private companion object {
        const val DESCRIPTION = "Download all emojis or stickers of the current server as a zip with /dumpexpressions."
    }
}
