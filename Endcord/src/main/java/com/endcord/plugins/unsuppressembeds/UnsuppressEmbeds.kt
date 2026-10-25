/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.unsuppressembeds

import android.content.Context
import com.aliucord.Http
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.isDM
import com.discord.models.message.Message
import com.discord.stores.StoreStream
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R

internal class UnsuppressEmbeds : EndcordPlugin(
    name = "UnsuppressEmbeds",
    description = "Allows you to unsuppress embeds in messages",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    /** Whether the embeds of [message] are suppressed, or null when the user can't change that. */
    private fun suppressedState(message: Message): Boolean? {
        val flags = message.flags ?: 0L
        val suppressed = flags and EMBED_SUPPRESSED != 0L
        if (!suppressed && message.embeds.isNullOrEmpty()) return null

        val channel = StoreStream.getChannels().getChannel(message.channelId) ?: return null
        val permissions = StoreStream.getPermissions().permissionsByChannel[message.channelId] ?: 0L
        val isMine = message.author?.id == StoreStream.getUsers().me.id
        val allowed = if (isMine) {
            channel.isDM() || permissions and EMBED_LINKS != 0L
        } else {
            // Discord only lets moderators change the embeds of other people's messages
            !channel.isDM() && permissions and MANAGE_MESSAGES != 0L
        }
        return if (allowed) suppressed else null
    }

    private fun setSuppressed(message: Message, suppress: Boolean) {
        val flags = message.flags ?: 0L
        val newFlags = if (suppress) flags or EMBED_SUPPRESSED else flags and EMBED_SUPPRESSED.inv()
        val route = "/channels/${message.channelId}/messages/${message.id}"
        Utils.threadPool.execute {
            try {
                Http.Request.newDiscordRNRequest(route, "PATCH")
                    .executeWithJson(mapOf("flags" to newFlags))
                    .assertOk()
            } catch (e: Throwable) {
                logger.errorToast(I18n.t("Failed to change the embeds of this message"), e)
            }
        }
    }

    override fun start(context: Context) {
        MessageActions.register(
            name,
            "Unsuppress Embeds",
            R.e.ic_embed_white_24dp,
            visible = { suppressedState(it.message) == true },
        ) { setSuppressed(it.message, false) }

        MessageActions.register(
            name,
            "Suppress Embeds",
            R.e.ic_visibility_off_white_a60_24dp,
            visible = { suppressedState(it.message) == false },
        ) { setSuppressed(it.message, true) }
    }

    private companion object {
        const val EMBED_SUPPRESSED = 1L shl 2
        const val MANAGE_MESSAGES = 1L shl 13
        const val EMBED_LINKS = 1L shl 14
    }
}
