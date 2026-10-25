/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.followuser

import android.content.Context
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.wrappers.ChannelWrapper.Companion.type
import com.aliucord.wrappers.ChannelWrapper.Companion.userLimit
import com.endcord.plugins.api.UserSheetActions
import com.endcord.plugins.voicecommon.CallIndicator
import com.endcord.plugins.voicecommon.Voice
import com.endcord.plugins.voicecommon.VoiceChange
import com.endcord.plugins.voicecommon.VoiceEvents
import com.lytefast.flexinput.R

internal class FollowUser : EndcordPlugin(
    name = "FollowUser",
    description = "Adds a Follow option to the user menu to always join the same voice channel as them",
    authors = arrayOf("vpg"),
) {
    override val tags = listOf("voice", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch("executeOnFollow", "Make sure to be in the same VC when following a user", default = true),
        PluginSetting.Switch("onlyManualTrigger", "Only trigger manually", "Only join when you tap \"Join followed user\" below"),
        PluginSetting.Switch("followLeave", "Also leave when the followed user leaves"),
        PluginSetting.Switch("autoMoveBack", "Automatically move back to the VC of the followed user when you got moved"),
        PluginSetting.Switch("channelFull", "Attempt to move you to the channel when is not full anymore", default = true),
        PluginSetting.Action("trigger", "Join followed user") { triggerFollow() },
        PluginSetting.Action("unfollow", "Stop following") {
            setFollowed(0L)
            Utils.showToast(I18n.t("Stopped following"))
        },
    )

    private fun followed(): Long = settings.getString(FOLLOW_KEY, "")?.toLongOrNull() ?: 0L

    private fun setFollowed(userId: Long) {
        settings.setString(FOLLOW_KEY, if (userId == 0L) "" else userId.toString())
        Utils.mainThread.post { CallIndicator.refresh() }
    }

    private fun toggleFollow(userId: Long) {
        if (followed() == userId) {
            setFollowed(0L)
            Utils.showToast(I18n.t("Stopped following {name}", "name" to Voice.username(userId)))
            return
        }
        setFollowed(userId)
        Utils.showToast(I18n.t("Following {name}", "name" to Voice.username(userId)))
        if (bool("executeOnFollow")) triggerFollow()
    }

    /** Port of PC's triggerFollow: join the followed user's channel, or leave when they left. Main thread. */
    private fun triggerFollow(target: Long? = Voice.channelOf(followed()), quiet: Boolean = false) {
        val userId = followed()
        if (userId == 0L) {
            if (!quiet) Utils.showToast(I18n.t("You are not following anyone"))
            return
        }
        val mine = Voice.myChannelId()
        if (target != null) {
            if (target == mine) {
                if (!quiet) Utils.showToast(I18n.t("You are already in the same channel"))
                return
            }
            val channel = Voice.channel(target) ?: return
            val isDm = channel.type == Voice.TYPE_DM || channel.type == Voice.TYPE_GROUP_DM
            if (!isDm && !Voice.can(channel, Voice.PERM_CONNECT)) {
                Utils.showToast(I18n.t("Insufficient permissions to enter in the voice channel"))
                return
            }
            if (channel.userLimit > 0 && Voice.isFull(channel) && !Voice.can(channel, Voice.PERM_MOVE_MEMBERS)) {
                Utils.showToast(I18n.t("Channel is full"))
                return
            }
            Voice.join(target) { result ->
                val failure = Voice.joinFailure(result)
                Utils.showToast(failure ?: I18n.t("Followed user into a new voice channel"))
            }
        } else if (mine != 0L) {
            if (bool("followLeave")) {
                Voice.leave()
                Utils.showToast(I18n.t("Followed user left, disconnected"))
            } else if (!quiet) {
                Utils.showToast(I18n.t("Followed user left, but not following disconnect"))
            }
        } else if (!quiet) {
            Utils.showToast(I18n.t("Followed user is not in a voice channel"))
        }
    }

    /** Port of PC's VOICE_STATE_UPDATES handler. Runs on the store thread. */
    private fun onVoiceChange(change: VoiceChange) {
        val userId = followed()
        if (userId == 0L || bool("onlyManualTrigger") || !change.channelChanged) return
        val newChannel = change.newChannelId
        val oldChannel = change.oldChannelId

        if (change.isMe) {
            // Moved by someone else: go back to the followed user
            if (bool("autoMoveBack") && newChannel != null && oldChannel != null) {
                val target = Voice.channelOf(userId)
                if (target != null && target != newChannel) Utils.mainThread.post { triggerFollow(target, quiet = true) }
            }
            return
        }

        // A slot opened in the followed user's full channel
        if (bool("channelFull") && newChannel == null && oldChannel != null && oldChannel != Voice.myChannelId()) {
            val channel = Voice.channel(oldChannel)
            if (channel != null && channel.userLimit > 0 && !Voice.can(channel, Voice.PERM_MOVE_MEMBERS)) {
                val states = Voice.liveStatesIn(oldChannel)
                if (states.size == channel.userLimit - 1 && states.any { it.m() == userId }) {
                    Utils.mainThread.post { triggerFollow(oldChannel, quiet = true) }
                    return
                }
            }
        }

        if (change.userId != userId) return
        Utils.mainThread.post { triggerFollow(newChannel, quiet = true) }
    }

    override fun start(context: Context) {
        UserSheetActions.register(
            name,
            "Follow User",
            R.e.ic_call_24dp,
            visible = { it.user.id != Voice.myId() && it.user.id != followed() },
        ) { toggleFollow(it.user.id) }
        UserSheetActions.register(
            name,
            "Unfollow User",
            R.e.ic_call_disconnect_24dp,
            visible = { it.user.id == followed() },
        ) { toggleFollow(it.user.id) }

        VoiceEvents.register(name, ::onVoiceChange)
        CallIndicator.register(name) {
            val userId = followed()
            if (userId == 0L) null else I18n.t("Following {name}", "name" to Voice.username(userId))
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        VoiceEvents.unregisterAll(name)
        CallIndicator.unregisterAll(name)
    }

    private companion object {
        const val FOLLOW_KEY = "followUserId"
    }
}
