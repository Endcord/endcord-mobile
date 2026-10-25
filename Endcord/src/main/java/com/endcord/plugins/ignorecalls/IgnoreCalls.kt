/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.ignorecalls

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.guildId
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.discord.models.domain.ModelCall
import com.discord.stores.StoreStream
import com.endcord.plugins.api.ChannelSheetActions
import com.endcord.plugins.notifycommon.IdList
import com.endcord.plugins.notifycommon.Msg
import com.endcord.plugins.notifycommon.NotifyHooks
import com.lytefast.flexinput.R
import java.lang.reflect.Field
import java.util.Collections
import com.discord.utilities.fcm.NotificationData as PushData

internal class IgnoreCalls : EndcordPlugin(
    name = "IgnoreCalls",
    description = "Allows you to ignore calls from specific users or dm groups.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("voice")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            "permanentlyIgnoredUsers",
            "Always ignored",
            "IDs of the DMs and group DMs whose calls are always ignored (comma separated). Long-press a DM to add it.",
            multiline = true,
        ),
    )

    private val permanent by lazy { IdList(settings, "permanentlyIgnoredUsers") }
    private val temporary: MutableSet<Long> = Collections.newSetFromMap(java.util.concurrent.ConcurrentHashMap())

    private fun isIgnored(channelId: Long) = channelId in temporary || channelId in permanent

    override fun start(context: Context) {
        NotifyHooks.calls(name) { call ->
            if (!isIgnored(call.channelId)) return@calls
            val me = Msg.me()
            val ringing = call.ringing ?: return@calls
            // Discord rings this device when the user is in the call's ringing list: take them out of it
            if (me != 0L && ringing.contains(me)) ringingField?.set(call, ringing.filter { it != me })
        }
        // A call's push notification still arrives while the app runs in the background
        NotifyHooks.pushes(name) { data ->
            !(data.type == PushData.TYPE_CALL_RING && isIgnored(data.channelId))
        }

        val privateChannel = { ctx: ChannelSheetActions.Context -> ctx.channel.guildId == 0L }
        ChannelSheetActions.register(name, "Temporarily Ignore Calls", R.e.ic_call_disconnect_24dp, visible = {
            privateChannel(it) && it.channel.id !in temporary && it.channel.id !in permanent
        }) {
            temporary.add(it.channel.id)
            stopRinging(it.channel.id)
            Utils.showToast(I18n.t("Calls from this chat are ignored until you restart Discord"))
        }
        ChannelSheetActions.register(name, "Permanently Ignore Calls", R.e.ic_call_disconnect_24dp, visible = {
            privateChannel(it) && it.channel.id !in permanent
        }) {
            temporary.remove(it.channel.id)
            permanent.toggle(it.channel.id)
            stopRinging(it.channel.id)
            Utils.showToast(I18n.t("Calls from this chat are always ignored"))
        }
        ChannelSheetActions.register(name, "Stop Ignoring Calls", R.e.ic_call_24dp, visible = {
            privateChannel(it) && isIgnored(it.channel.id)
        }) {
            temporary.remove(it.channel.id)
            if (it.channel.id in permanent) permanent.toggle(it.channel.id)
            Utils.showToast(I18n.t("Calls from this chat ring again"))
        }
    }

    override fun stop(context: Context) {
        NotifyHooks.unregisterAll(name)
        super.stop(context)
    }

    /** Silences a call that is ringing right now. */
    private fun stopRinging(channelId: Long) {
        try {
            if (channelId in StoreStream.getCallsIncoming().incomingCalls) StoreStream.getCallsIncoming().removeIncomingCall(channelId)
        } catch (e: Throwable) {
            logger.error("Failed to stop the ringing call", e)
        }
    }

    private companion object {
        val ringingField: Field? = try {
            ModelCall::class.java.getDeclaredField("ringing").apply { isAccessible = true }
        } catch (_: Throwable) {
            null
        }
    }
}
