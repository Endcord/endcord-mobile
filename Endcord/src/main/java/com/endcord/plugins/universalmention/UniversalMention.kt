/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.universalmention

import android.content.Context
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.patcher.after
import com.aliucord.patcher.instead
import com.aliucord.wrappers.ChannelWrapper.Companion.recipientIds
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.discord.api.channel.Channel
import com.discord.stores.StoreChannels
import com.discord.stores.StoreStream
import com.discord.widgets.chat.input.autocomplete.Autocompletable
import com.discord.widgets.chat.input.autocomplete.LeadingIdentifier
import com.discord.widgets.chat.input.autocomplete.UserAutocompletable
import com.discord.widgets.chat.input.autocomplete.sources.UserAutocompletableSource
import java.util.TreeSet
import com.discord.models.user.User as ModelUser

/**
 * The Android app already lists every loaded member of the server when typing `@`, but then drops the ones who
 * can't read the channel ([UserAutocompletable.getCanUserReadChannel]). Forcing that check to pass keeps them,
 * which is what Endcord PC's patch does. With "Global mention" every user the app knows about is added too.
 */
internal class UniversalMention : EndcordPlugin(
    name = "UniversalMention",
    description = "Mention any user, regardless of channel access.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "servers", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            key = "globalMention",
            label = "Mention users from any server, not just the current one",
            description = "Using Global Mention can cause performance issues and show an absurd amount of users in the autocomplete.",
        ),
        PluginSetting.Switch(
            key = "onlyDMUsers",
            label = "Only show users you've had DMs with",
            description = "Limits Global Mention to people you have a direct message with",
        ),
    )

    /** Autocomplete entries for every known user, rebuilt only when the user store or the filter changes. */
    private var cachedUsers: Map<Long, ModelUser>? = null
    private var cachedOnlyDm = false
    private var cachedExtras: List<UserAutocompletable> = emptyList()

    override fun start(context: Context) {
        patcher.instead<UserAutocompletable>("getCanUserReadChannel") { true }

        val long = Long::class.javaPrimitiveType!!
        patcher.after<UserAutocompletableSource>(
            "createAutocompletablesForUsers",
            long,
            Channel::class.java,
            Channel::class.java,
            long,
            Map::class.java,
            Map::class.java,
            Map::class.java,
            Map::class.java,
            Long::class.javaObjectType,
        ) { param ->
            @Suppress("UNCHECKED_CAST")
            addEveryone(param.result, (param.args[5] as Map<Long, *>?)?.keys ?: emptySet())
        }
        patcher.after<UserAutocompletableSource>("createAutocompletablesForDmUsers", Map::class.java, Map::class.java, List::class.java) { param ->
            @Suppress("UNCHECKED_CAST")
            addEveryone(param.result, (param.args[0] as Map<Long, *>?)?.keys ?: emptySet())
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        synchronized(this) {
            cachedUsers = null
            cachedExtras = emptyList()
        }
    }

    /** Adds every known user not in [present] to the mention suggestions in [result], when Global mention is on. */
    private fun addEveryone(result: Any?, present: Set<Long>) {
        if (!bool("globalMention")) return
        try {
            @Suppress("UNCHECKED_CAST")
            val set = (result as? Map<LeadingIdentifier, TreeSet<Autocompletable>>)?.get(LeadingIdentifier.MENTION) ?: return
            for (entry in extras()) {
                if (entry.user.id !in present) set.add(entry)
            }
        } catch (e: Throwable) {
            logger.error("Failed to add users to the mention suggestions", e)
        }
    }

    @Synchronized
    private fun extras(): List<UserAutocompletable> {
        val users = StoreStream.getUsers().users
        val onlyDm = bool("onlyDMUsers")
        if (users === cachedUsers && onlyDm == cachedOnlyDm) return cachedExtras

        val dmUsers = if (onlyDm) dmUserIds() else null
        val me = StoreStream.getUsers().me.id
        val list = ArrayList<UserAutocompletable>(users.size)
        for (user in users.values) {
            if (user.id == me) continue
            if (dmUsers != null && user.id !in dmUsers) continue
            // No member, nickname or presence: these people may not be in this server at all
            list.add(UserAutocompletable(user, null, null, null, true))
        }
        cachedUsers = users
        cachedOnlyDm = onlyDm
        cachedExtras = list
        return list
    }

    private fun dmUserIds(): Set<Long> {
        val channels = StoreStream.getChannels().getChannelsForGuild(StoreChannels.PRIVATE_CHANNELS_ID)?.values
            ?: return emptySet()
        val ids = HashSet<Long>()
        for (channel in channels) {
            if (channel.type == Channel.DM) ids.addAll(channel.recipientIds)
        }
        return ids
    }
}
