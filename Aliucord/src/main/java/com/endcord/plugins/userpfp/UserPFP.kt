/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.userpfp

import android.content.Context
import android.text.InputType
import android.widget.EditText
import android.widget.FrameLayout
import androidx.appcompat.app.AlertDialog
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.utils.DimenUtils.dp
import com.discord.utilities.icon.IconUtils
import com.endcord.plugins.api.UserSheetActions
import com.endcord.plugins.commandscommon.Net
import com.lytefast.flexinput.R
import de.robv.android.xposed.XC_MethodHook
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

internal class UserPFP : EndcordPlugin(
    name = "UserPFP",
    description = "Allows you to use an animated avatar without Nitro",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "customisation", "servers")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            key = "overrideServerAvatars",
            label = "Override server avatars",
            description = "Override server avatars with custom avatars or the default user avatar if no custom avatar is set.",
            default = true,
        ),
        PluginSetting.Choice(
            key = "preferNitro",
            label = "Which avatar to use if both default animated (Nitro) pfp and UserPFP avatars are present",
            options = listOf(
                PluginSetting.Choice.Option("userpfp", "UserPFP"),
                PluginSetting.Choice.Option("nitro", "Nitro"),
            ),
            default = "nitro",
        ),
        PluginSetting.Action(
            key = "joinServer",
            label = "Join UserPFP Server",
        ) { Utils.launchUrl("https://discord.gg/userpfp-1129784704267210844") },
    )

    /** Avatars from the UserPFP database. */
    private val remote = ConcurrentHashMap<Long, String>()

    /** Avatars you set yourself with "Set Avatar", only visible to you. They win over [remote]. */
    private val local = ConcurrentHashMap<Long, String>()

    override fun start(context: Context) {
        loadLocal()
        Utils.threadPool.execute { loadRemote() }

        // Every user avatar url is built by this overload: (userId, avatarHash, discriminator, animated, size)
        patcher.patch(
            IconUtils::class.java.getDeclaredMethod(
                "getForUser",
                java.lang.Long::class.java,
                String::class.java,
                Integer::class.java,
                Boolean::class.javaPrimitiveType!!,
                Integer::class.java,
            ),
            object : XC_MethodHook() {
                override fun afterHookedMethod(param: MethodHookParam) {
                    try {
                        val userId = param.args[0] as Long? ?: return
                        val hash = param.args[1] as String?
                        if (choice("preferNitro") == "nitro" && hash?.startsWith("a_") == true && !local.containsKey(userId)) return
                        val url = customAvatar(userId, param.args[3] as Boolean) ?: return
                        param.result = url
                    } catch (e: Throwable) {
                        logger.error("Failed to swap an avatar", e)
                    }
                }
            },
        )

        // Server avatars: (avatarHash, guildId, userId, size, animated)
        patcher.after<IconUtils>(
            "getForGuildMember",
            String::class.java,
            Long::class.javaPrimitiveType!!,
            Long::class.javaPrimitiveType!!,
            Integer::class.java,
            Boolean::class.javaPrimitiveType!!,
        ) { param ->
            try {
                if (!bool("overrideServerAvatars")) return@after
                val url = customAvatar(param.args[2] as Long, param.args[4] as Boolean) ?: return@after
                param.result = url
            } catch (e: Throwable) {
                this@UserPFP.logger.error("Failed to swap a server avatar", e)
            }
        }

        UserSheetActions.register(name, "Set Avatar", R.e.ic_edit_24dp) { ctx ->
            val activity = ctx.sheet.activity ?: return@register
            showSetAvatarDialog(activity, ctx.user.id)
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        remote.clear()
        local.clear()
    }

    private fun customAvatar(userId: Long, animated: Boolean): String? {
        val url = local[userId] ?: remote[userId] ?: return null
        if (!animated && url.startsWith(USERPFP_IMG_URL)) {
            // UserPFP hosts a still copy of every animated avatar
            return url.replace(".gifv", ".png").replace(".gif", ".png")
        }
        return url
    }

    private fun showSetAvatarDialog(context: Context, userId: Long) {
        val input = EditText(context).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            hint = I18n.t("Enter PNG/GIF URL")
            setText(local[userId] ?: "")
            setSingleLine()
        }
        val container = FrameLayout(context).apply {
            setPadding(20.dp, 8.dp, 20.dp, 0)
            addView(input)
        }
        AlertDialog.Builder(context)
            .setTitle(I18n.t("Set Avatar"))
            .setMessage(I18n.t("Using the set avatar feature is local only meaning only you see it change."))
            .setView(container)
            .setPositiveButton(I18n.t("Save")) { _, _ ->
                val url = input.text.toString().trim()
                if (url.startsWith("https://") || url.startsWith("http://")) {
                    local[userId] = url
                    saveLocal()
                } else if (url.isEmpty()) {
                    local.remove(userId)
                    saveLocal()
                } else {
                    Utils.showToast(I18n.t("Enter PNG/GIF URL"))
                }
            }
            .setNeutralButton(I18n.t("Remove")) { _, _ ->
                local.remove(userId)
                saveLocal()
            }
            .setNegativeButton(I18n.t("Cancel"), null)
            .show()
    }

    private fun loadLocal() {
        try {
            val json = JSONObject(settings.getString(LOCAL_KEY, "{}") ?: "{}")
            val keys = json.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val id = key.toLongOrNull() ?: continue
                local[id] = json.optString(key)
            }
        } catch (e: Throwable) {
            logger.error("Failed to read your custom avatars", e)
        }
    }

    private fun saveLocal() {
        val json = JSONObject()
        for ((id, url) in local) json.put(id.toString(), url)
        settings.setString(LOCAL_KEY, json.toString())
    }

    private fun loadRemote() {
        try {
            val avatars = Net.getObject(DATABASE_URL).optJSONObject("avatars") ?: return
            val keys = avatars.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val id = key.toLongOrNull() ?: continue
                val url = avatars.optString(key)
                if (url.isNotEmpty()) remote[id] = url
            }
        } catch (e: Throwable) {
            logger.warn("Failed to load the UserPFP database: ${e.message}")
        }
    }

    private companion object {
        const val DATABASE_URL = "https://userpfp.github.io/UserPFP/source/data.json"
        const val USERPFP_IMG_URL = "https://raw.githubusercontent.com/UserPFP/img"
        const val LOCAL_KEY = "customAvatars"
    }
}
