/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.relationshipnotifier

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.patcher.before
import com.aliucord.utils.ChannelUtils
import com.aliucord.wrappers.ChannelWrapper.Companion.icon
import com.aliucord.wrappers.ChannelWrapper.Companion.id
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.aliucord.wrappers.GuildWrapper.Companion.id
import com.aliucord.wrappers.GuildWrapper.Companion.unavailable
import com.discord.models.domain.ModelUserRelationship
import com.discord.restapi.RestAPIParams
import com.discord.stores.StoreChannels
import com.discord.stores.StoreStream
import com.discord.utilities.rest.RestAPI
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.notifycommon.Msg
import com.endcord.plugins.notifycommon.Notifier
import com.endcord.plugins.notifycommon.NotifyHooks
import com.endcord.plugins.notifycommon.Profiles
import org.json.JSONObject

internal class RelationshipNotifier : EndcordPlugin(
    name = "RelationshipNotifier",
    description = "Notifies you when a friend, group chat, or server removes you.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("friends", "notifications")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            "notices",
            "Keep a notification in the notification shade",
            "Also post an Android notification while the app is open, so you don't miss any removal",
        ),
        PluginSetting.Switch("offlineRemovals", "Notify about removals while offline", "Notify you when starting Discord if you were removed while offline.", true),
        PluginSetting.Switch("friends", "Friends", "Notify when a friend removes you", true),
        PluginSetting.Switch("friendRequestCancels", "Friend requests", "Notify when a friend request is cancelled", true),
        PluginSetting.Switch("servers", "Servers", "Notify when removed from a server", true),
        PluginSetting.Switch("groups", "Group chats", "Notify when removed from a group chat", true),
    )

    /** What the user was part of the last time we looked, saved so removals while offline are noticed. */
    private class Known(val name: String, val icon: String?)

    private class Snapshot {
        val guilds = LinkedHashMap<Long, Known>()
        val groups = LinkedHashMap<Long, Known>()
        val friends = LinkedHashMap<Long, String>()
        val requests = LinkedHashMap<Long, String>()
    }

    private val lock = Any()
    private var snapshot: Snapshot? = null

    // Removals the user did themselves, which must not be reported
    @Volatile private var removedFriend = 0L
    @Volatile private var leftGuild = 0L
    @Volatile private var leftGroup = 0L

    private val checkRunnable = Runnable { Utils.threadPool.execute { syncAndCheck() } }

    override fun start(context: Context) {
        NotifyHooks.trackAppState(name)

        patcher.before<RestAPI>("removeRelationship", Long::class.javaPrimitiveType!!, String::class.java) { param ->
            removedFriend = param.args[0] as Long
        }
        patcher.before<RestAPI>("removeRelationship", String::class.java, Long::class.javaPrimitiveType!!) { param ->
            removedFriend = param.args[1] as Long
        }
        patcher.before<RestAPI>("leaveGuild", Long::class.javaPrimitiveType!!) { param ->
            leftGuild = param.args[0] as Long
        }
        patcher.before<RestAPI>("leaveGuild", Long::class.javaPrimitiveType!!, RestAPIParams.LeaveGuildBody::class.java) { param ->
            leftGuild = param.args[0] as Long
        }
        patcher.before<RestAPI>("deleteChannel", Long::class.javaPrimitiveType!!) { param ->
            leftGroup = param.args[0] as Long
        }

        NotifyHooks.relationshipRemoved(name) { relationship, previous -> onRelationshipRemoved(relationship, previous) }
        NotifyHooks.guildRemoved(name) { guild ->
            val id = guild.id
            if (leftGuild == id) {
                leftGuild = 0L
                forgetGuild(id)
                return@guildRemoved
            }
            if (guild.unavailable || id in StoreStream.getGuilds().unavailableGuilds) return@guildRemoved
            val known = synchronized(lock) { snapshot?.guilds?.remove(id) }
                ?: StoreStream.getGuilds().getGuild(id)?.let { Known(it.name, guildIcon(id, it.icon)) }
                ?: return@guildRemoved
            if (bool("servers")) notify("guild:$id", I18n.t("You were removed from the server {name}.", "name" to known.name), known.icon)
            saveLater()
        }
        NotifyHooks.channelDeleted(name) { channel ->
            if (channel.type != 3) return@channelDeleted
            val id = channel.id
            if (leftGroup == id) {
                leftGroup = 0L
                synchronized(lock) { snapshot?.groups?.remove(id) }
                saveLater()
                return@channelDeleted
            }
            val known = synchronized(lock) { snapshot?.groups?.remove(id) } ?: Known(groupName(channel), groupIcon(channel))
            if (bool("groups")) notify("group:$id", I18n.t("You were removed from the group {name}.", "name" to known.name), known.icon)
            saveLater()
        }
        NotifyHooks.connectionOpen(name) {
            // Discord's stores publish what the connection loaded once this dispatch ends; look a little later
            Utils.mainThread.removeCallbacks(checkRunnable)
            Utils.mainThread.postDelayed(checkRunnable, 3_000L)
        }
        // Already connected when the plugin is turned on
        Utils.mainThread.postDelayed(checkRunnable, 3_000L)
    }

    override fun stop(context: Context) {
        Utils.mainThread.removeCallbacks(checkRunnable)
        NotifyHooks.unregisterAll(name)
        super.stop(context)
    }

    private fun onRelationshipRemoved(relationship: ModelUserRelationship, previous: Int?) {
        val userId = relationship.id
        if (removedFriend == userId) {
            removedFriend = 0L
            synchronized(lock) {
                snapshot?.friends?.remove(userId)
                snapshot?.requests?.remove(userId)
            }
            saveLater()
            return
        }
        val type = previous ?: relationship.type
        val name = synchronized(lock) { snapshot?.friends?.remove(userId) ?: snapshot?.requests?.remove(userId) }
            ?: relationship.user?.let { Msg.apiName(it) }
            ?: Msg.nameOf(userId)
        when (type) {
            ModelUserRelationship.TYPE_FRIEND -> if (bool("friends")) {
                notifyUser(userId, I18n.t("{user} removed you as a friend.", "user" to name))
            }
            ModelUserRelationship.TYPE_INVITE_INCOMING -> if (bool("friendRequestCancels")) {
                notifyUser(userId, I18n.t("A friend request from {user} has been removed.", "user" to name))
            }
        }
        saveLater()
    }

    // ---- snapshot ----

    private fun current(): Snapshot {
        val out = Snapshot()
        for ((id, guild) in StoreStream.getGuilds().guilds) {
            out.guilds[id] = Known(guild.name, guildIcon(id, guild.icon))
        }
        for (channel in StoreStream.getChannels().getChannelsForGuild(StoreChannels.PRIVATE_CHANNELS_ID).values) {
            if (channel.type == 3) out.groups[channel.id] = Known(groupName(channel), groupIcon(channel))
        }
        for ((id, type) in StoreStream.getUserRelationships().relationships) {
            when (type) {
                ModelUserRelationship.TYPE_FRIEND -> out.friends[id] = Msg.nameOf(id)
                ModelUserRelationship.TYPE_INVITE_INCOMING -> out.requests[id] = Msg.nameOf(id)
            }
        }
        return out
    }

    /** Compares what the user is part of now with the saved snapshot, reports what is gone, and saves. */
    private fun syncAndCheck() {
        try {
            val me = Msg.me()
            if (me == 0L) return
            // Nothing loaded yet (still connecting): checking now would report everything as removed
            if (StoreStream.getGuilds().guilds.isEmpty() && StoreStream.getUserRelationships().relationships.isEmpty()) return
            val now = current()
            val old = synchronized(lock) { snapshot } ?: load(me)
            synchronized(lock) { snapshot = now }
            save(me, now)
            if (old == null || !bool("offlineRemovals")) return

            val unavailable = StoreStream.getGuilds().unavailableGuilds
            if (bool("groups")) for ((id, group) in old.groups) {
                if (id !in now.groups) notify("group:$id", I18n.t("You are no longer in the group {name}.", "name" to group.name), group.icon)
            }
            if (bool("servers")) for ((id, guild) in old.guilds) {
                if (id !in now.guilds && id !in unavailable) {
                    notify("guild:$id", I18n.t("You are no longer in the server {name}.", "name" to guild.name), guild.icon)
                }
            }
            if (bool("friends")) for ((id, user) in old.friends) {
                if (id !in now.friends) notifyUser(id, I18n.t("You are no longer friends with {user}.", "user" to user))
            }
            if (bool("friendRequestCancels")) {
                val relationships = StoreStream.getUserRelationships().relationships
                for ((id, user) in old.requests) {
                    val type = relationships[id]
                    if (id in now.requests || type == ModelUserRelationship.TYPE_FRIEND || type == ModelUserRelationship.TYPE_BLOCKED ||
                        type == ModelUserRelationship.TYPE_INVITE_OUTGOING
                    ) continue
                    notifyUser(id, I18n.t("Friend request from {user} has been revoked.", "user" to user))
                }
            }
        } catch (e: Throwable) {
            logger.error("Failed to check for removals", e)
        }
    }

    private fun forgetGuild(id: Long) {
        synchronized(lock) { snapshot?.guilds?.remove(id) }
        saveLater()
    }

    private fun saveLater() {
        val me = Msg.me()
        val copy = synchronized(lock) { snapshot } ?: return
        Common.io.execute { save(me, copy) }
    }

    private fun key(me: Long) = "snapshot_$me"

    private fun save(me: Long, snapshot: Snapshot) {
        if (me == 0L) return
        try {
            val json = JSONObject()
            synchronized(lock) {
                json.put("guilds", pairs(snapshot.guilds))
                json.put("groups", pairs(snapshot.groups))
                json.put("friends", JSONObject().apply { snapshot.friends.forEach { (id, n) -> put(id.toString(), n) } })
                json.put("requests", JSONObject().apply { snapshot.requests.forEach { (id, n) -> put(id.toString(), n) } })
            }
            settings.setString(key(me), json.toString())
        } catch (e: Throwable) {
            logger.error("Failed to save the snapshot", e)
        }
    }

    private fun pairs(map: Map<Long, Known>) = JSONObject().apply {
        for ((id, value) in map) put(id.toString(), JSONObject().put("name", value.name).put("icon", value.icon ?: ""))
    }

    private fun load(me: Long): Snapshot? {
        val text = settings.getString(key(me), null) ?: return null
        return try {
            val json = JSONObject(text)
            Snapshot().apply {
                readPairs(json.optJSONObject("guilds"), guilds)
                readPairs(json.optJSONObject("groups"), groups)
                readNames(json.optJSONObject("friends"), friends)
                readNames(json.optJSONObject("requests"), requests)
            }
        } catch (e: Throwable) {
            logger.error("Failed to read the snapshot", e)
            null
        }
    }

    private fun readPairs(json: JSONObject?, into: MutableMap<Long, Known>) {
        json ?: return
        for (key in json.keys()) {
            val id = key.toLongOrNull() ?: continue
            val value = json.optJSONObject(key) ?: continue
            into[id] = Known(value.optString("name"), value.optString("icon").ifEmpty { null })
        }
    }

    private fun readNames(json: JSONObject?, into: MutableMap<Long, String>) {
        json ?: return
        for (key in json.keys()) {
            val id = key.toLongOrNull() ?: continue
            into[id] = json.optString(key)
        }
    }

    // ---- presentation ----

    private fun guildIcon(id: Long, icon: String?) =
        if (icon.isNullOrEmpty()) null else "https://cdn.discordapp.com/icons/$id/$icon.png"

    private fun groupIcon(channel: com.discord.api.channel.Channel) =
        channel.icon.let { if (it.isNullOrEmpty()) null else "https://cdn.discordapp.com/channel-icons/${channel.id}/$it.png" }

    private fun groupName(channel: com.discord.api.channel.Channel): String = try {
        ChannelUtils.getDisplayName(channel)
    } catch (_: Throwable) {
        null
    }.orEmpty().ifEmpty { I18n.t("Unnamed group") }

    private fun notify(key: String, text: String, icon: String?, target: Notifier.Target = Notifier.Target()) {
        Notifier.show(
            key = "$name:$key",
            title = "Relationship Notifier",
            body = text,
            iconUrl = icon,
            target = target,
            alsoSystem = bool("notices"),
            seconds = 10,
        )
    }

    private fun notifyUser(userId: Long, text: String) =
        notify("user:$userId", text, Msg.avatarOf(userId), Notifier.Target(onClick = { Profiles.open(it, userId) }))
}
