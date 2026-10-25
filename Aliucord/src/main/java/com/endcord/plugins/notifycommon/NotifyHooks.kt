/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.notifycommon

import android.content.Context
import com.aliucord.Logger
import com.aliucord.api.PatcherAPI
import com.aliucord.api.Unpatch
import com.aliucord.patcher.after
import com.aliucord.patcher.before
import com.discord.api.channel.Channel
import com.discord.api.guild.Guild
import com.discord.api.message.reaction.MessageReactionUpdate
import com.discord.models.domain.ModelCall
import com.discord.models.domain.ModelPayload
import com.discord.models.domain.ModelUserRelationship
import com.discord.stores.NotificationTextUtils
import com.discord.stores.StoreMessagesLoader
import com.discord.stores.StoreStream
import com.discord.utilities.fcm.NotificationClient
import com.discord.utilities.fcm.NotificationRenderer
import com.discord.models.guild.Guild as ModelGuild
import com.discord.models.message.Message as ModelMessage
import com.discord.models.user.User as ModelUser
import com.discord.api.message.Message as ApiMessage
import com.discord.utilities.fcm.NotificationData as PushData

/**
 * The gateway events the notification plugins react to, hooked once and shared.
 *
 * Every event is a single patch on Discord's own entry point (mostly `StoreStream.handleX`, which hands the
 * event to all of Discord's stores), installed when the first plugin listens to it and removed when the last
 * one stops. Several plugins reacting to new messages therefore never patch the same store twice, and their
 * order is fixed by the priority they register with (lower runs first).
 *
 * Listeners of store events run on Discord's store thread: keep them short and post UI work to the main
 * thread. Owners must call [unregisterAll] when they stop.
 */
internal object NotifyHooks {
    private val logger = Logger("NotifyHooks")
    private val patcher = PatcherAPI(logger)

    /** Where a message passed to an [incoming] listener comes from. */
    enum class Source { CREATE, UPDATE, LOAD }

    /** A message about to reach Discord's stores. Listeners may change its mentions through [Mentions]. */
    class Incoming(
        /** The gateway message for [Source.CREATE] and [Source.UPDATE]. */
        @JvmField val api: ApiMessage?,
        /** The stored message for [Source.LOAD]. */
        @JvmField val model: ModelMessage?,
        @JvmField val source: Source,
    ) {
        val id: Long get() = api?.o() ?: model!!.id
        val channelId: Long get() = api?.g() ?: model!!.channelId
        val content: String? get() = if (api != null) api.i() else model!!.content
        val author: com.discord.api.user.User? get() = if (api != null) api.e() else model!!.author
        val embeds: List<com.discord.api.message.embed.MessageEmbed>? get() = if (api != null) api.k() else model!!.embeds
        val target: Any get() = api ?: model!!
    }

    private class Event<L>(private val name: String, private val install: () -> List<Unpatch>) {
        private class Entry<L>(val owner: String, val priority: Int, val listener: L)

        private val entries = ArrayList<Entry<L>>()
        private var unpatches: List<Unpatch>? = null

        /** Listeners sorted by priority. Replaced, never mutated, so the hooks can iterate it without locking. */
        @Volatile
        var listeners: List<L> = emptyList()
            private set

        @Synchronized
        fun add(owner: String, priority: Int, listener: L) {
            entries += Entry(owner, priority, listener)
            listeners = entries.sortedBy { it.priority }.map { it.listener }
            if (unpatches == null) {
                unpatches = try {
                    install()
                } catch (e: Throwable) {
                    logger.error("Failed to hook $name", e)
                    emptyList()
                }
            }
        }

        @Synchronized
        fun remove(owner: String) {
            if (!entries.removeAll { it.owner == owner }) return
            listeners = entries.sortedBy { it.priority }.map { it.listener }
            if (entries.isEmpty()) {
                unpatches?.forEach { it.run() }
                unpatches = null
            }
        }
    }

    private inline fun <L> Event<L>.each(block: (L) -> Unit) {
        for (listener in listeners) {
            try {
                block(listener)
            } catch (e: Throwable) {
                logger.error("A listener failed", e)
            }
        }
    }

    // ---- events ----

    private val incomingEvent: Event<(Incoming) -> Unit> = Event("incoming messages") {
        listOf(
            patcher.before<StoreStream>("handleMessageCreate", ApiMessage::class.java) { param ->
                val message = param.args[0] as? ApiMessage ?: return@before
                val incoming = Incoming(message, null, Source.CREATE)
                incomingEvent.each { it(incoming) }
            },
            patcher.before<StoreStream>("handleMessageUpdate", ApiMessage::class.java) { param ->
                val message = param.args[0] as? ApiMessage ?: return@before
                // Partial updates (embeds resolving) carry no content and no mentions: leave them alone
                if (message.i() == null) return@before
                val incoming = Incoming(message, null, Source.UPDATE)
                incomingEvent.each { it(incoming) }
            },
            patcher.before<StoreStream>("handleMessagesLoaded", StoreMessagesLoader.ChannelChunk::class.java) { param ->
                val chunk = param.args[0] as? StoreMessagesLoader.ChannelChunk ?: return@before
                val messages = chunk.messages ?: return@before
                for (message in messages) {
                    if (message == null) continue
                    val incoming = Incoming(null, message, Source.LOAD)
                    incomingEvent.each { it(incoming) }
                }
            },
        )
    }

    private val messageEvent: Event<(ApiMessage) -> Unit> = Event("new messages") {
        listOf(
            patcher.after<StoreStream>("handleMessageCreate", ApiMessage::class.java) { param ->
                val message = param.args[0] as? ApiMessage ?: return@after
                messageEvent.each { it(message) }
            },
        )
    }

    private val popupEvent: Event<PopupListener> = Event("in-app popups") {
        listOf(
            patcher.after<NotificationTextUtils>(
                "shouldNotifyInAppPopup",
                ModelUser::class.java,
                ApiMessage::class.java,
                Channel::class.java,
                Map::class.java,
                Channel::class.java,
                ModelGuild::class.java,
                Map::class.java,
                Map::class.java,
                Map::class.java,
                Long::class.javaPrimitiveType!!,
                Long::class.javaObjectType,
            ) { param ->
                if (param.result != true) return@after
                val message = param.args[1] as? ApiMessage ?: return@after
                val channel = param.args[2] as? Channel ?: return@after
                val listeners = popupEvent.listeners
                for (listener in listeners) {
                    val allowed = try {
                        listener.allowPopup(message, channel)
                    } catch (e: Throwable) {
                        logger.error("A popup filter failed", e)
                        true
                    }
                    if (!allowed) {
                        param.result = false
                        return@after
                    }
                }
                for (listener in listeners) {
                    try {
                        listener.onPopup(message, channel)
                    } catch (e: Throwable) {
                        logger.error("A popup listener failed", e)
                    }
                }
            },
        )
    }

    private val pushEvent: Event<(PushData) -> Boolean> = Event("push notifications") {
        listOf(
            patcher.before<NotificationRenderer>(
                "display",
                Context::class.java,
                PushData::class.java,
                NotificationClient.SettingsV2::class.java,
            ) { param ->
                val data = param.args[1] as? PushData ?: return@before
                for (listener in pushEvent.listeners) {
                    val allowed = try {
                        listener(data)
                    } catch (e: Throwable) {
                        logger.error("A push filter failed", e)
                        true
                    }
                    if (!allowed) {
                        param.result = null
                        return@before
                    }
                }
            },
        )
    }

    private val reactionEvent: Event<(MessageReactionUpdate) -> Unit> = Event("reactions") {
        listOf(
            patcher.after<StoreStream>("handleReactionAdd", MessageReactionUpdate::class.java) { param ->
                val update = param.args[0] as? MessageReactionUpdate ?: return@after
                reactionEvent.each { it(update) }
            },
        )
    }

    private val relationshipEvent: Event<(ModelUserRelationship, Int?) -> Unit> = Event("removed relationships") {
        listOf(
            patcher.before<StoreStream>("handleRelationshipRemove", ModelUserRelationship::class.java) { param ->
                val relationship = param.args[0] as? ModelUserRelationship ?: return@before
                // The type the store knew before the removal, the event's own type can be missing
                val previous = StoreStream.getUserRelationships().relationships[relationship.id]
                relationshipEvent.each { it(relationship, previous) }
            },
        )
    }

    private val guildEvent: Event<(Guild) -> Unit> = Event("removed servers") {
        listOf(
            patcher.before<StoreStream>("handleGuildRemove", Guild::class.java) { param ->
                val guild = param.args[0] as? Guild ?: return@before
                guildEvent.each { it(guild) }
            },
        )
    }

    private val channelEvent: Event<(Channel) -> Unit> = Event("deleted channels") {
        listOf(
            patcher.before<StoreStream>("handleChannelDelete", Channel::class.java) { param ->
                val channel = param.args[0] as? Channel ?: return@before
                channelEvent.each { it(channel) }
            },
        )
    }

    private val callEvent: Event<(ModelCall) -> Unit> = Event("calls") {
        listOf(
            patcher.before<StoreStream>("handleCallCreateOrUpdate", ModelCall::class.java) { param ->
                val call = param.args[0] as? ModelCall ?: return@before
                callEvent.each { it(call) }
            },
        )
    }

    private val connectionEvent: Event<() -> Unit> = Event("connection open") {
        listOf(
            patcher.after<StoreStream>("handleConnectionOpen", ModelPayload::class.java) {
                connectionEvent.each { it() }
            },
        )
    }

    private val backgroundEvent: Event<(Boolean) -> Unit> = Event("app state") {
        listOf(
            patcher.after<StoreStream>("handleBackgrounded", Boolean::class.javaPrimitiveType!!) { param ->
                val backgrounded = param.args[0] as? Boolean ?: return@after
                isBackgrounded = backgrounded
                backgroundEvent.each { it(backgrounded) }
            },
        )
    }

    /** Whether Discord is in the background, known once a plugin called [trackAppState]. */
    @Volatile
    var isBackgrounded = false
        private set

    /** Decides about Discord's own in-app popup for a message, and hears about the popups it shows. */
    interface PopupListener {
        /** Return false to keep Discord from showing its popup for [message]. */
        fun allowPopup(message: ApiMessage, channel: Channel): Boolean = true

        /** Discord is about to show its popup for [message]. */
        fun onPopup(message: ApiMessage, channel: Channel) {}
    }

    // ---- registration ----

    /** Messages before Discord stores them: new ones, edits with content, and loaded history. */
    fun incoming(owner: String, priority: Int = 0, listener: (Incoming) -> Unit) = incomingEvent.add(owner, priority, listener)

    /** New messages from the gateway, after Discord's stores processed them. Includes the user's own. */
    fun messages(owner: String, priority: Int = 0, listener: (ApiMessage) -> Unit) = messageEvent.add(owner, priority, listener)

    /** Discord's in-app popups for new messages. */
    fun popups(owner: String, priority: Int = 0, listener: PopupListener) = popupEvent.add(owner, priority, listener)

    /**
     * Push notifications Discord is about to show in the system tray while Endcord runs. Return false to drop
     * one. Push notifications that arrive while the app is closed never reach plugins.
     */
    fun pushes(owner: String, priority: Int = 0, listener: (PushData) -> Boolean) = pushEvent.add(owner, priority, listener)

    /** Reactions added to any message. */
    fun reactions(owner: String, listener: (MessageReactionUpdate) -> Unit) = reactionEvent.add(owner, 0, listener)

    /** Removed friends, friend requests and blocks, with the type the relationship had before. */
    fun relationshipRemoved(owner: String, listener: (ModelUserRelationship, Int?) -> Unit) = relationshipEvent.add(owner, 0, listener)

    /** Servers the user left, was removed from, or that became unavailable, before Discord forgets them. */
    fun guildRemoved(owner: String, listener: (Guild) -> Unit) = guildEvent.add(owner, 0, listener)

    /** Deleted channels, including group DMs the user left or was removed from, before Discord forgets them. */
    fun channelDeleted(owner: String, listener: (Channel) -> Unit) = channelEvent.add(owner, 0, listener)

    /** Call updates, before Discord rings. Listeners may change who is rung. */
    fun calls(owner: String, listener: (ModelCall) -> Unit) = callEvent.add(owner, 0, listener)

    /** The gateway connected (also after reconnects); guilds, channels and relationships are loaded. */
    fun connectionOpen(owner: String, listener: () -> Unit) = connectionEvent.add(owner, 0, listener)

    /** Keeps [isBackgrounded] up to date for [owner], optionally calling [listener] on changes. */
    fun trackAppState(owner: String, listener: (Boolean) -> Unit = {}) = backgroundEvent.add(owner, 0, listener)

    /** Removes every listener [owner] registered, and the hooks nobody listens to anymore. */
    fun unregisterAll(owner: String) {
        incomingEvent.remove(owner)
        messageEvent.remove(owner)
        popupEvent.remove(owner)
        pushEvent.remove(owner)
        reactionEvent.remove(owner)
        relationshipEvent.remove(owner)
        guildEvent.remove(owner)
        channelEvent.remove(owner)
        callEvent.remove(owner)
        connectionEvent.remove(owner)
        backgroundEvent.remove(owner)
    }
}
