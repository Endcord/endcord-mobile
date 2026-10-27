/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { currentUserId, getStore, onAction } from "../common";
import { botMessage, displayName, getUser } from "../hooks";
import { ids } from "../shared/notify";

export default definePlugin({
    id: "endcord.voice-join-messages",
    name: "VoiceJoinMessages",
    description: tx("Receive client-side ephemeral messages when your friends join voice channels"),
    icon: "VoiceNormalIcon",
    tags: ["Voice", "Friends", "Notifications"],
    settings: {
        friendDirectMessagesShowMemberCount: { type: "boolean", label: tx("Show member count"), description: tx("Show the count of other members in the voice channel when receiving a DM notification of your friend joining a voice channel"), default: true },
        friendDirectMessagesSelf: { type: "boolean", label: tx("Even in my channel"), description: tx("Receive notifications in your friends' DMs even if you are in the same voice channel as them"), default: false },
        allowedFriends: { type: "string", label: tx("Only these friends"), description: tx("User IDs of the friends to get join messages from, separated by commas or spaces; empty means all friends"), default: "" },
        ignoredFriends: { type: "string", label: tx("Ignored friends"), description: tx("User IDs of the friends to never get join messages from, separated by commas or spaces"), default: "" },
    },
    start({ store, cleanup }) {
        cleanup(onAction<{ voiceStates: any[]; }>("VOICE_STATE_UPDATES", ({ voiceStates }) => {
            const voiceStore = getStore("VoiceStateStore");
            const myChannel = getStore("SelectedChannelStore")?.getVoiceChannelId?.();
            for (const state of voiceStates ?? []) {
                const { userId, channelId } = state;
                if (!channelId || userId === currentUserId()) continue;
                if (!getStore("RelationshipStore")?.isFriend?.(userId)) continue;
                const allowed = ids(store.allowedFriends);
                if (allowed.size && !allowed.has(userId) || ids(store.ignoredFriends).has(userId)) continue;
                const previous = voiceStore?.getVoiceStateForUser?.(userId)?.channelId;
                if (previous === channelId) continue;
                if (!store.friendDirectMessagesSelf && channelId === myChannel) continue;
                const dm = getStore("ChannelStore")?.getDMFromUserId?.(userId);
                if (!dm) continue;
                const others = Object.keys(voiceStore?.getVoiceStatesForChannel?.(channelId) ?? {}).filter(id => id !== userId).length;
                const count = store.friendDirectMessagesShowMemberCount && others ? ` ${t("with {count} others", { count: others })}` : "";
                const vars = { user: `**${displayName(getUser(userId))}**`, channel: `<#${channelId}>` };
                const text = previous ? t("{user} moved to {channel}", vars) : t("{user} joined {channel}", vars);
                setTimeout(() => botMessage(dm, `🔊 ${text}${count}`), 0);
            }
        }));
    },
});
