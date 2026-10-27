/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { currentUserId, subscribe } from "../common";
import { addMessageAction, api, describeError, getChannel } from "../hooks";
import { myVoiceChannel, permission } from "../shared/calls";

async function moveMember(guildId: string, userId: string, channelId: string | null) {
    await api("patch", `/guilds/${guildId}/members/${userId}`, { channel_id: channelId });
}

export default definePlugin({
    id: "endcord.pull-user-into-voice",
    name: "PullUserIntoVoice",
    description: tx("Pull a message's author into your voice channel from the message menu, and keep pulling them if you like"),
    icon: "VoiceNormalIcon",
    tags: ["Voice", "Servers"],
    settings: {
        pullWhenUserLeaves: { type: "boolean", label: tx("Keep pulling them"), description: tx("Keep pulling the user even when they leave your voice channel entirely"), default: false },
    },
    start({ store, cleanup }) {
        let target: { guildId: string; userId: string; } | undefined;
        const pull = (guildId: string, userId: string) => {
            const mine = myVoiceChannel();
            if (!mine) return;
            moveMember(guildId, userId, mine).catch(e => showToast(t("Request failed: {error}", { error: describeError(e) }), findAssetId("CircleXIcon-primary")));
        };
        cleanup(
            subscribe("VOICE_STATE_UPDATES", ({ voiceStates }) => {
                if (!target || !store.pullWhenUserLeaves) return;
                const state = (voiceStates ?? []).find((s: any) => s.userId === target!.userId);
                const mine = myVoiceChannel();
                if (state && mine && state.channelId !== mine && getChannel(mine)?.guild_id === target.guildId) setTimeout(() => pull(target!.guildId, target!.userId), 500);
            }),
            addMessageAction({
                key: "pull-user-into-voice",
                icon: "VoiceNormalIcon",
                label: message => target?.userId === message.author?.id ? t("Stop Pulling Into My Voice Channel") : t("Pull Into My Voice Channel"),
                visible: (message, channel) => {
                    const mine = myVoiceChannel();
                    return !!mine && !!channel?.guild_id && getChannel(mine)?.guild_id === channel.guild_id
                        && message.author?.id !== currentUserId() && permission("MOVE_MEMBERS", getChannel(mine));
                },
                onPress: (message, channel) => {
                    if (target?.userId === message.author.id) {
                        target = undefined;
                        return;
                    }
                    target = { guildId: channel.guild_id, userId: message.author.id };
                    pull(channel.guild_id, message.author.id);
                },
            }),
        );
    },
});
