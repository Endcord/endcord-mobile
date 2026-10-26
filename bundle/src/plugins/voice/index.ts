/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Voice channel plugins: staying in calls, following people and finding a channel to join.
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { instead } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore, subscribe } from "../common";
import { addMessageAction, botMessage, command, displayName, getChannel } from "../hooks";

const voiceActions = () => findByProps("selectVoiceChannel", "disconnect") ?? findByProps("selectVoiceChannel");
const myVoiceChannel = (): string | undefined => getStore("SelectedChannelStore")?.getVoiceChannelId?.() ?? undefined;

function join(channelId: string) {
    const actions = voiceActions();
    if (!actions?.selectVoiceChannel) throw new Error("Discord's voice actions weren't found");
    actions.selectVoiceChannel(channelId);
}

const lastCall = wrapSync(createStorage<{ channelId?: string; at?: number; }>(createMMKVBackend("ENDCORD_VOICE_REJOIN", {})));

const VoiceRejoin = definePlugin({
    id: "endcord.voice-rejoin",
    name: "VoiceRejoin",
    description: tx("Rejoins DM/Server call automatically when restarting Discord."),
    authors: [ENDCORD_AUTHOR],
    icon: "VoiceNormalIcon",
    tags: ["Voice"],
    settings: {
        rejoinDelay: { type: "number", label: tx("Delay (seconds)"), description: tx("Set Delay before rejoining voice channel."), default: 3, min: 0, max: 60 },
        rejoinTimeout: { type: "number", label: tx("Give up after (minutes)"), description: tx("Don't rejoin a call you left longer ago than this"), default: 10, min: 1, max: 1440 },
        applyOnlyToDms: { type: "boolean", label: tx("Only calls"), description: tx("Only apply to DMs."), default: false },
    },
    async start({ store, cleanup }) {
        await awaitStorage(lastCall);
        const saved = { ...lastCall };
        let timer: ReturnType<typeof setTimeout> | undefined;
        if (saved.channelId && saved.at && Date.now() - saved.at < store.rejoinTimeout * 60_000 && !myVoiceChannel()) {
            timer = setTimeout(() => {
                const channel = getChannel(saved.channelId);
                if (!channel || myVoiceChannel() || store.applyOnlyToDms && channel.guild_id) return;
                try {
                    join(saved.channelId!);
                    showToast(t("Rejoined {channel}", { channel: channel.name || t("the call") }), findAssetId("VoiceNormalIcon"));
                } catch { }
            }, store.rejoinDelay * 1000);
        }
        // The call you're in is saved while you're in it, so it's known after a restart
        const save = () => {
            const channelId = myVoiceChannel();
            lastCall.channelId = channelId;
            lastCall.at = channelId ? Date.now() : undefined;
        };
        const heartbeat = setInterval(() => myVoiceChannel() && save(), 30_000);
        cleanup(
            () => {
                clearTimeout(timer);
                clearInterval(heartbeat);
            },
            subscribe("VOICE_CHANNEL_SELECT", () => setTimeout(save, 0)),
        );
    },
});

const DisableCallIdle = definePlugin({
    id: "endcord.disable-call-idle",
    name: "DisableCallIdle",
    description: tx("Disables automatically getting kicked from a DM voice call after 3 minutes and being moved to an AFK voice channel."),
    authors: [ENDCORD_AUTHOR],
    icon: "PhoneCallIcon",
    tags: ["Voice"],
    start({ cleanup }) {
        const manager = findByProps("idleTimeout", "handleVoiceStateUpdates");
        const timer = manager?.idleTimeout ?? manager?.default?.idleTimeout;
        if (typeof timer?.start !== "function") throw new Error("Discord's call idle timer wasn't found");
        timer.stop?.();
        cleanup(instead("start", timer, () => { }));
    },
});

const FollowUser = definePlugin({
    id: "endcord.follow-user",
    name: "FollowUser",
    description: tx("Adds a Follow option to the user menu to always join the same voice channel as them"),
    authors: [ENDCORD_AUTHOR],
    icon: "ArrowAngleRightUpIcon",
    tags: ["Voice", "Friends"],
    settings: {
        followUserId: { type: "string", label: tx("Followed user"), description: tx("Followed User ID"), default: "" },
        followLeave: { type: "boolean", label: tx("Leave with them"), description: tx("Also leave when the followed user leaves"), default: false },
        executeOnFollow: { type: "boolean", label: tx("Join right away"), description: tx("Make sure to be in the same VC when following a user"), default: true },
    },
    start({ store, cleanup }) {
        const follow = (channelId?: string | null) => {
            if (channelId && channelId !== myVoiceChannel()) {
                try {
                    join(channelId);
                } catch { }
            }
        };
        cleanup(
            subscribe("VOICE_STATE_UPDATES", ({ voiceStates }) => {
                const followed = store.followUserId.trim();
                if (!followed) return;
                for (const state of voiceStates ?? []) {
                    if (state.userId !== followed) continue;
                    if (state.channelId) follow(state.channelId);
                    else if (store.followLeave && myVoiceChannel()) voiceActions()?.disconnect?.();
                }
            }),
            addMessageAction({
                key: "follow-user",
                icon: "ArrowAngleRightUpIcon",
                label: message => store.followUserId === message.author?.id ? t("Unfollow in Voice") : t("Follow in Voice"),
                visible: message => !!message.author?.id && message.author.id !== currentUserId(),
                onPress: message => {
                    if (store.followUserId === message.author.id) {
                        store.followUserId = "";
                        showToast(t("Stopped following {user}", { user: displayName(message.author) }), findAssetId("ArrowAngleRightUpIcon"));
                        return;
                    }
                    store.followUserId = message.author.id;
                    showToast(t("Following {user} in voice channels", { user: displayName(message.author) }), findAssetId("ArrowAngleRightUpIcon"));
                    if (store.executeOnFollow) follow(getStore("VoiceStateStore")?.getVoiceStateForUser?.(message.author.id)?.channelId);
                },
            }),
        );
    },
});

const RandomVoice = definePlugin({
    id: "endcord.random-voice",
    name: "RandomVoice",
    description: tx("Adds a button near mute to join a random voice channel."),
    authors: [ENDCORD_AUTHOR],
    icon: "VoiceNormalIcon",
    tags: ["Voice", "Fun"],
    settings: {
        leaveEmpty: { type: "boolean", label: tx("Only channels with people"), description: tx("Only join voice channels someone is already in"), default: true },
        sameServer: { type: "boolean", label: tx("This server only"), description: tx("Only pick channels in the server you're in"), default: false },
    },
    start({ store, cleanup }) {
        cleanup(command({
            name: "randomvoice",
            description: tx("Join a random voice channel"),
            run: (_, ctx) => {
                const voiceStates = getStore("VoiceStateStore");
                const permissions = findByProps("Permissions", "ChannelTypes")?.Permissions;
                const can = (channel: any) => !permissions || getStore("PermissionStore")?.can?.(permissions.CONNECT, channel);
                const guilds = store.sameServer && ctx.channel.guild_id ? [ctx.channel.guild_id] : Object.keys(getStore("GuildStore")?.getGuilds?.() ?? {});
                const candidates: string[] = [];
                for (const guildId of guilds) {
                    for (const { channel } of getStore("GuildChannelStore")?.getChannels?.(guildId)?.VOCAL ?? []) {
                        if (!channel || channel.id === myVoiceChannel() || !can(channel)) continue;
                        const people = Object.keys(voiceStates?.getVoiceStatesForChannel?.(channel.id) ?? {}).length;
                        if (store.leaveEmpty && !people) continue;
                        if (channel.userLimit && people >= channel.userLimit) continue;
                        candidates.push(channel.id);
                    }
                }
                if (!candidates.length) {
                    botMessage(ctx.channel.id, t("There's no voice channel to join."));
                    return;
                }
                const pick = candidates[Math.floor(Math.random() * candidates.length)];
                join(pick);
                botMessage(ctx.channel.id, t("Joining <#{channel}>…", { channel: pick }));
            },
        }));
    },
});

export default [VoiceRejoin, DisableCallIdle, FollowUser, RandomVoice];
