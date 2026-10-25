/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.viewraw

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.utils.GsonUtils
import com.aliucord.utils.GsonUtils.toJson
import com.endcord.plugins.api.ChannelSheetActions
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.api.UserSheetActions
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R
import org.json.JSONArray
import org.json.JSONObject

internal class ViewRaw : EndcordPlugin(
    name = "ViewRaw",
    description = "Copy and view the raw content/data of any message, channel or guild",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "developers")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            key = "copyEntry",
            label = "Show Copy Raw Content",
            description = "Also add an entry to the message menu that copies the raw text right away",
        ),
    )

    override fun start(context: Context) {
        MessageActions.register(name, "View Raw", R.e.ic_info_24dp) { ctx ->
            val message = ctx.message
            val json = toJson(message.synthesizeApiMessage())
            open(ctx.sheet.requireContext(), "Raw Message Data", "Message Data", json, message.content)
        }
        MessageActions.register(
            name,
            "Copy Raw Content",
            R.e.ic_copy_24dp,
            visible = { bool("copyEntry") && !it.message.content.isNullOrEmpty() },
        ) { Common.copy(it.message.content) }

        ChannelSheetActions.register(name, "View Raw", R.e.ic_info_24dp) { ctx ->
            open(ctx.sheet.requireContext(), "Raw Channel Data", "Channel Data", toJson(ctx.channel), null)
        }
        UserSheetActions.register(name, "View Raw", R.e.ic_info_24dp) { ctx ->
            val data = JSONObject()
            data.put("user", JSONObject(toJson(ctx.user)))
            ctx.state.userProfile?.let { data.put("profile", JSONObject(toJson(it))) }
            ctx.state.guildMember?.let { data.put("member", JSONObject(toJson(it))) }
            open(ctx.sheet.requireContext(), "Raw User Data", "User Data", clean(data).toString(2), null)
        }
    }

    override fun stop(context: Context) {
        ChannelSheetActions.unregisterAll(name)
        UserSheetActions.unregisterAll(name)
        super.stop(context)
    }

    private fun open(context: Context, title: String, dataHeader: String, json: String, content: String?) {
        Utils.openPageWithProxy(context, ViewRawPage().apply {
            pageTitle = I18n.t(title)
            this.dataHeader = I18n.t(dataHeader)
            this.json = json
            this.content = content
        })
    }

    /** Serializes [obj] the way Discord's API spells it, sorted and without account secrets. */
    private fun toJson(obj: Any): String {
        val raw = try {
            GsonUtils.gsonRestApi.toJson(obj)
        } catch (e: Throwable) {
            logger.warn("Falling back to plain Gson for ${obj.javaClass.name}: $e")
            GsonUtils.gson.toJson(obj)
        }
        return try {
            if (raw.trimStart().startsWith("[")) JSONArray(raw).toString(2) else clean(JSONObject(raw)).toString(2)
        } catch (e: Throwable) {
            raw
        }
    }

    /** Sorts keys and drops fields that only exist on your own account, like the e-mail address. */
    private fun clean(obj: JSONObject): JSONObject {
        val out = JSONObject()
        val keys = ArrayList<String>()
        obj.keys().forEach { keys.add(it) }
        keys.sort()
        for (key in keys) {
            if (key in hidden) continue
            out.put(key, cleanValue(obj.get(key)))
        }
        return out
    }

    private fun cleanValue(value: Any?): Any? = when (value) {
        is JSONObject -> clean(value)
        is JSONArray -> JSONArray().also { array ->
            for (i in 0 until value.length()) array.put(cleanValue(value.get(i)))
        }
        else -> value
    }

    private companion object {
        // Your own user object carries your token, e-mail and phone number: never show or copy those
        val hidden = setOf(
            "token", "email", "phone", "phone_number", "phoneNumber", "mfa_enabled", "mfaEnabled",
            "personal_connection_id", "personalConnectionId",
        )
    }
}
