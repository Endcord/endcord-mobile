/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.usrbg

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.after
import com.discord.utilities.icon.IconUtils
import com.discord.widgets.user.profile.UserProfileHeaderViewModel
import com.endcord.plugins.commandscommon.Net

internal class USRBG : EndcordPlugin(
    name = "USRBG",
    description = "Displays user banners from USRBG, allowing anyone to get a banner without Nitro",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "customisation", "profiles")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            key = "nitroFirst",
            label = "Banner to use if both Nitro and USRBG banners are present",
            options = listOf(
                PluginSetting.Choice.Option("nitro", "Nitro banner"),
                PluginSetting.Choice.Option("usrbg", "USRBG banner"),
            ),
            default = "nitro",
        ),
        PluginSetting.Action(
            key = "getBanner",
            label = "Get your own USRBG banner",
        ) { Utils.launchUrl("https://github.com/AutumnVN/usrbg#how-to-request-your-own-usrbg-banner") },
    )

    /** What the USRBG API returns: where the images live and the users that have one (id to etag). */
    private class Database(val endpoint: String, val bucket: String, val prefix: String, val users: Map<Long, String>)

    @Volatile
    private var database: Database? = null

    override fun start(context: Context) {
        Utils.threadPool.execute { load() }

        // The profile header only asks for a banner url when the user has a banner, so hand it a placeholder
        // hash for users with a USRBG banner and turn that into the real url below
        patcher.after<UserProfileHeaderViewModel.ViewState.Loaded>("getBanner") { param ->
            try {
                if (editable) return@after
                val userId = user?.id ?: return@after
                if (database?.users?.containsKey(userId) != true) return@after
                if (param.result != null && choice("nitroFirst") == "nitro") return@after
                param.result = MARKER
            } catch (e: Throwable) {
                this@USRBG.logger.error("Failed to swap a profile banner", e)
            }
        }

        patcher.after<IconUtils>(
            "getForUserBanner",
            Long::class.javaPrimitiveType!!,
            String::class.java,
            Integer::class.java,
            Boolean::class.javaPrimitiveType!!,
        ) { param ->
            if (param.args[1] != MARKER) return@after
            param.result = imageUrl(param.args[0] as Long)
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        database = null
    }

    private fun imageUrl(userId: Long): String? {
        val db = database ?: return null
        val etag = db.users[userId] ?: return null
        return "${db.endpoint}/${db.bucket}/${db.prefix}$userId?$etag"
    }

    private fun load() {
        try {
            val json = Net.getObject(API_URL)
            val usersJson = json.getJSONObject("users")
            val users = HashMap<Long, String>(usersJson.length() * 2)
            val keys = usersJson.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val id = key.toLongOrNull() ?: continue
                users[id] = usersJson.optString(key)
            }
            database = Database(json.getString("endpoint"), json.getString("bucket"), json.optString("prefix"), users)
        } catch (e: Throwable) {
            logger.warn("Failed to load the USRBG database: ${e.message}")
        }
    }

    private companion object {
        const val API_URL = "https://usrbg.is-hardly.online/users"
        const val MARKER = "endcord_usrbg"
    }
}
