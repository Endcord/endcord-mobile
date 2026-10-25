/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.commandscommon

import com.aliucord.Logger
import com.aliucord.Utils
import com.discord.api.message.MessageFlags
import com.discord.models.message.Message
import com.discord.stores.StoreMessages
import com.discord.stores.StoreStream
import com.discord.utilities.message.LocalMessageCreatorsKt
import com.discord.utilities.time.ClockFactory
import java.lang.reflect.Field

/**
 * Local messages from Clyde that only the user can see, for output that arrives after a command already
 * returned its result (countdowns, late network replies).
 */
internal object BotMessages {
    private val logger = Logger("CommandsCommon")

    private val flagsField: Field by lazy {
        Message::class.java.getDeclaredField("flags").apply { isAccessible = true }
    }

    /** Shows [content] in [channelId] as an ephemeral Clyde message. Safe to call from any thread. */
    @JvmStatic
    fun send(channelId: Long, content: String) {
        try {
            val message = LocalMessageCreatorsKt.createLocalMessage(
                content,
                channelId,
                Utils.buildClyde(null, null),
                null,
                false,
                false,
                null,
                null,
                ClockFactory.get(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
            )
            flagsField.set(message, MessageFlags.EPHEMERAL)
            StoreMessages.`access$handleLocalMessageCreate`(StoreStream.getMessages(), message)
        } catch (e: Throwable) {
            logger.error("Failed to show a local message", e)
        }
    }
}
