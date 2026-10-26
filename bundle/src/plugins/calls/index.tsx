/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * More of Endcord PC's voice channel plugins: what's going on in your call, and acting on everyone in it.
 */

import { t, tx } from "@core/i18n";
import { addOverlay } from "@core/overlay";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { before } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { Text } from "@metro/common/components";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore, subscribe } from "../common";
import { addMessageAction, api, botMessage, command, describeError, displayName, getChannel, getUser, playSound } from "../hooks";
import LogList from "../ui/LogList";

const myVoiceChannel = (): string | undefined => getStore("SelectedChannelStore")?.getVoiceChannelId?.() ?? undefined;
const voiceActions = () => findByProps("selectVoiceChannel", "disconnect") ?? findByProps("selectVoiceChannel");
const statesIn = (channelId?: string): Record<string, any> => channelId ? getStore("VoiceStateStore")?.getVoiceStatesForChannel?.(channelId) ?? {} : {};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function permission(name: string, channel: any): boolean {
    const permissions = findByProps("Permissions", "ChannelTypes")?.Permissions;
    return !!(permissions?.[name] && channel && getStore("PermissionStore")?.can?.(permissions[name], channel));
}

const clock = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

// CallTimer ------------------------------------------------------------------------------------------------------------

let callStarted: number | undefined;

function Timer() {
    const [, tick] = useState(0);
    const inCall = !!myVoiceChannel() && callStarted != null;
    useEffect(() => {
        // Only ticks while you're in a call; otherwise the overlay draws nothing and costs nothing
        if (!inCall) return;
        const timer = setInterval(() => tick(n => n + 1), 1000);
        return () => clearInterval(timer);
    }, [inCall]);
    if (!inCall) return null;
    const top = CallTimer.store.position === "top";
    return <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, [top ? "top" : "bottom"]: top ? 34 : 96, alignItems: "center" }}>
        <View style={{ backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text variant="text-xs/semibold" style={{ color: "white" }}>🔊 {clock(Date.now() - callStarted!)}</Text>
        </View>
    </View>;
}

let redrawTimer: (() => void) | undefined;
function TimerHost() {
    const [, update] = useState(0);
    useEffect(() => {
        redrawTimer = () => update(n => n + 1);
        return () => void (redrawTimer = undefined);
    }, []);
    return <Timer />;
}

const CallTimer = definePlugin({
    id: "endcord.call-timer",
    name: "CallTimer",
    description: tx("Shows how long you have been in the current voice call"),
    authors: [ENDCORD_AUTHOR],
    icon: "TimerIcon",
    tags: ["Voice"],
    settings: {
        position: {
            type: "select",
            label: tx("Where the timer is"),
            default: "top",
            options: [{ label: tx("Top of the screen"), value: "top" }, { label: tx("Above the message box"), value: "bottom" }],
        },
    },
    start({ cleanup }) {
        callStarted = myVoiceChannel() ? Date.now() : undefined;
        cleanup(
            () => void (callStarted = undefined),
            addOverlay("call-timer", TimerHost),
            subscribe("VOICE_CHANNEL_SELECT", ({ channelId }) => {
                if (!channelId) callStarted = undefined;
                else if (callStarted == null) callStarted = Date.now();
                redrawTimer?.();
            }),
        );
    },
});

// WaitForSlot ----------------------------------------------------------------------------------------------------------

const WaitForSlot = definePlugin({
    id: "endcord.wait-for-slot",
    name: "WaitForSlot",
    description: tx("Automatically join a full voice channel when a slot opens."),
    authors: [ENDCORD_AUTHOR],
    icon: "VoiceNormalIcon",
    tags: ["Voice"],
    settings: {
        autoJoin: { type: "boolean", label: tx("Join right away"), description: tx("Join the channel immediately instead of showing a notice."), default: true },
    },
    start({ store, cleanup }) {
        let waiting: string | undefined;
        const check = () => {
            if (!waiting) return;
            const channel = getChannel(waiting);
            const count = Object.keys(statesIn(waiting)).length;
            if (!channel || channel.userLimit && count >= channel.userLimit) return;
            const id = waiting;
            waiting = undefined;
            if (store.autoJoin) voiceActions()?.selectVoiceChannel?.(id);
            showToast(store.autoJoin ? t("A slot opened in {channel}; joining", { channel: channel.name }) : t("A slot opened in {channel}", { channel: channel.name }), findAssetId("VoiceNormalIcon"));
        };
        cleanup(
            subscribe("VOICE_STATE_UPDATES", check),
            command({
                name: "waitforslot",
                description: tx("Join a full voice channel as soon as someone leaves"),
                options: [{ name: "channel", description: tx("The voice channel"), type: "channel", required: true }],
                run: ({ channel: channelId }, ctx) => {
                    const channel = getChannel(channelId);
                    if (!channel || ![2, 13].includes(channel.type)) {
                        botMessage(ctx.channel.id, t("Pick a voice channel."));
                        return;
                    }
                    waiting = channelId;
                    botMessage(ctx.channel.id, t("Waiting for a slot in <#{channel}>.", { channel: channelId }));
                    check();
                },
            }),
        );
    },
});

// WebcamStartNotifier --------------------------------------------------------------------------------------------------

const WebcamStartNotifier = definePlugin({
    id: "endcord.webcam-start-notifier",
    name: "WebcamStartNotifier",
    description: tx("Tells you when someone in your voice channel turns their camera on or off"),
    authors: [ENDCORD_AUTHOR],
    icon: "VideoIcon",
    tags: ["Voice", "Notifications"],
    settings: {
        playInPrivate: { type: "boolean", label: tx("In calls"), description: tx("Play notification sound in private voice calls (DMs)"), default: true },
        playInServer: { type: "boolean", label: tx("In servers"), description: tx("Play notification sound in server voice channels"), default: true },
        sound: { type: "string", label: tx("Sound"), description: tx("A link to a sound to play; leave empty for none"), default: "" },
    },
    start({ store, cleanup }) {
        const cameras = new Map<string, boolean>();
        cleanup(subscribe("VOICE_STATE_UPDATES", ({ voiceStates }) => {
            const mine = myVoiceChannel();
            if (!mine) return cameras.clear();
            const server = !!getChannel(mine)?.guild_id;
            if (server ? !store.playInServer : !store.playInPrivate) return;
            for (const state of voiceStates ?? []) {
                if (state.userId === currentUserId()) continue;
                const before = cameras.get(state.userId) ?? false;
                const now = state.channelId === mine && !!state.selfVideo;
                cameras.set(state.userId, now);
                if (before === now || state.channelId !== mine && !before) continue;
                const name = displayName(getUser(state.userId) ?? { id: state.userId });
                showToast(now ? t("{user} turned on their camera", { user: name }) : t("{user} turned off their camera", { user: name }), findAssetId("VideoIcon"));
                if (store.sound.trim()) playSound(store.sound.trim());
            }
        }));
    },
});

// PullUserIntoVoice ----------------------------------------------------------------------------------------------------

async function moveMember(guildId: string, userId: string, channelId: string | null) {
    await api("patch", `/guilds/${guildId}/members/${userId}`, { channel_id: channelId });
}

const PullUserIntoVoice = definePlugin({
    id: "endcord.pull-user-into-voice",
    name: "PullUserIntoVoice",
    description: tx("Pull a message's author into your voice channel from the message menu, and keep pulling them if you like"),
    authors: [ENDCORD_AUTHOR],
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

// VoiceChatUtilities ---------------------------------------------------------------------------------------------------

const VOICE_ACTIONS = ["disconnect", "mute", "unmute", "deafen", "undeafen", "move"] as const;

const VoiceChatUtilities = definePlugin({
    id: "endcord.voice-chat-utilities",
    name: "VoiceChatUtilities",
    description: tx("Disconnect, move, mute or deafen everyone in your voice channel at once with /voiceall"),
    authors: [ENDCORD_AUTHOR],
    icon: "VoiceNormalIcon",
    tags: ["Voice", "Servers"],
    settings: {
        waitAfter: { type: "number", label: tx("Actions before a pause"), description: tx("Amount of API actions to perform before waiting (to avoid rate limits)"), default: 5, min: 1, max: 50 },
        waitSeconds: { type: "number", label: tx("Pause (seconds)"), description: tx("Time to wait between each action (in seconds)"), default: 2, min: 0, max: 30 },
    },
    start({ store, cleanup }) {
        let busy = false;
        cleanup(command({
            name: "voiceall",
            description: tx("Act on everyone in your voice channel"),
            options: [
                { name: "action", description: tx("What to do"), required: true, choices: VOICE_ACTIONS.map(a => ({ name: a, value: a })) },
                { name: "to", description: tx("The voice channel to move them to"), type: "channel" },
            ],
            run: async ({ action, to }, ctx) => {
                const mine = myVoiceChannel();
                const channel = getChannel(mine);
                if (!channel?.guild_id) {
                    botMessage(ctx.channel.id, t("Join a server voice channel first."));
                    return;
                }
                if (action === "move" && !to) {
                    botMessage(ctx.channel.id, t("Pick a voice channel to move them to."));
                    return;
                }
                if (busy) {
                    botMessage(ctx.channel.id, t("Still working on the last one."));
                    return;
                }
                const needed = action === "disconnect" || action === "move" ? "MOVE_MEMBERS" : action.includes("mute") ? "MUTE_MEMBERS" : "DEAFEN_MEMBERS";
                if (!permission(needed, channel)) {
                    botMessage(ctx.channel.id, t("You don't have permission to do that here."));
                    return;
                }
                busy = true;
                const users = Object.keys(statesIn(mine)).filter(id => id !== currentUserId());
                const body = {
                    disconnect: { channel_id: null }, move: { channel_id: to }, mute: { mute: true }, unmute: { mute: false },
                    deafen: { deaf: true }, undeafen: { deaf: false },
                }[action as typeof VOICE_ACTIONS[number]];
                let done = 0;
                try {
                    for (const [i, userId] of users.entries()) {
                        await api("patch", `/guilds/${channel.guild_id}/members/${userId}`, body).then(() => done++).catch(() => { });
                        if ((i + 1) % store.waitAfter === 0) await sleep(store.waitSeconds * 1000);
                    }
                } finally {
                    busy = false;
                }
                botMessage(ctx.channel.id, t("Done for {count} of {total} members.", { count: done, total: users.length }));
            },
        }));
    },
});

// AntiMoveDeco ---------------------------------------------------------------------------------------------------------

const AntiMoveDeco = definePlugin({
    id: "endcord.anti-move-deco",
    name: "AntiMoveDeco",
    description: tx("Puts you back in your voice channel when someone moves or disconnects you"),
    authors: [ENDCORD_AUTHOR],
    icon: "ShieldIcon",
    tags: ["Voice"],
    settings: {
        moves: { type: "boolean", label: tx("When I'm moved"), description: tx("Go back when someone moves you to another channel"), default: true },
        disconnects: { type: "boolean", label: tx("When I'm disconnected"), description: tx("Rejoin when someone disconnects you"), default: true },
    },
    start({ store, cleanup }) {
        const actions = voiceActions();
        if (typeof actions?.selectVoiceChannel !== "function") throw new Error("Discord's voice actions weren't found");
        // The channel you chose yourself. Only your own joins, switches and leaves go through these two, so a move by
        // someone else (which Discord reports like any other) is never mistaken for your choice.
        let wanted = myVoiceChannel();
        // Moves back in the last minute: when something keeps moving you, this gives up instead of fighting it
        let recent: number[] = [];
        cleanup(
            before("selectVoiceChannel", actions, ([channelId]: any[]) => void (wanted = channelId ?? undefined)),
            typeof actions.disconnect === "function" ? before("disconnect", actions, () => void (wanted = undefined)) : undefined,
            subscribe("VOICE_STATE_UPDATES", ({ voiceStates }) => {
                const me = (voiceStates ?? []).find((s: any) => s.userId === currentUserId());
                if (!me || !wanted || me.channelId === wanted) return;
                if (me.channelId ? !store.moves : !store.disconnects) return;
                const now = Date.now();
                recent = recent.filter(at => now - at < 60_000);
                if (recent.length >= 3) {
                    wanted = undefined;
                    showToast(t("Stopped moving you back, since someone keeps moving you"), findAssetId("ShieldIcon"));
                    return;
                }
                recent.push(now);
                const back = wanted;
                setTimeout(() => {
                    // You went somewhere else yourself meanwhile
                    if (wanted !== back) return;
                    actions.selectVoiceChannel(back);
                    showToast(t("Moved back to {channel}", { channel: getChannel(back)?.name ?? "" }), findAssetId("ShieldIcon"));
                }, 400);
            }),
        );
    },
});

// VoiceServerInfo ------------------------------------------------------------------------------------------------------

function voiceServerInfo() {
    const rtc = getStore("RTCConnectionStore");
    const host = rtc?.getHostname?.();
    if (!host) return undefined;
    const ping = rtc?.getAveragePing?.() ?? rtc?.getLastPing?.();
    return { host, ping: typeof ping === "number" ? Math.round(ping) : undefined };
}

const VoiceServerInfo = definePlugin({
    id: "endcord.voice-server-info",
    name: "VoiceServerInfo",
    description: tx("Shows the Discord voice server you're connected to and its ping"),
    authors: [ENDCORD_AUTHOR],
    icon: "ServerIcon",
    tags: ["Voice", "Utility"],
    settings: {
        notifyOnConnect: { type: "boolean", label: tx("Tell me on connect"), description: tx("Show the voice relay address and location after connecting."), default: false },
    },
    start({ store, cleanup }) {
        const describe = () => {
            const info = voiceServerInfo();
            return info ? `${info.host}${info.ping != null ? ` · ${info.ping} ms` : ""}` : undefined;
        };
        cleanup(
            subscribe("RTC_CONNECTION_STATE", ({ state }) => {
                if (store.notifyOnConnect && state === "RTC_CONNECTED") setTimeout(() => {
                    const text = describe();
                    if (text) showToast(text, findAssetId("ServerIcon"));
                }, 1500);
            }),
            command({
                name: "voiceserver",
                description: tx("Show the voice server you're connected to (only you see it)"),
                run: (_, ctx) => void botMessage(ctx.channel.id, describe() ? `🔊 ${describe()}` : t("You're not connected to a voice channel.")),
            }),
        );
    },
});

// VoiceFakeDetector ----------------------------------------------------------------------------------------------------

const VoiceFakeDetector = definePlugin({
    id: "endcord.voice-fake-detector",
    name: "VoiceFakeDetector",
    description: tx("Tells you when someone in your voice channel shows as muted or deafened but is talking"),
    authors: [ENDCORD_AUTHOR],
    icon: "MicrophoneSlashIcon",
    tags: ["Voice"],
    start({ cleanup }) {
        const flagged = new Set<string>();
        cleanup(
            subscribe("SPEAKING", ({ userId, speakingFlags }) => {
                if (!speakingFlags || !userId || userId === currentUserId() || flagged.has(userId)) return;
                const mine = myVoiceChannel();
                const state = statesIn(mine)[userId];
                if (!state || !(state.selfMute || state.selfDeaf)) return;
                flagged.add(userId);
                showToast(t("{user} shows as muted but is talking", { user: displayName(getUser(userId) ?? { id: userId }) }), findAssetId("MicrophoneSlashIcon"));
            }),
            subscribe("VOICE_STATE_UPDATES", ({ voiceStates }) => {
                // The mark clears once they leave or really unmute
                for (const s of voiceStates ?? []) if (!s.channelId || !s.selfMute && !s.selfDeaf) flagged.delete(s.userId);
            }),
        );
    },
});

// VoiceStats -----------------------------------------------------------------------------------------------------------

const voiceTime = wrapSync(createStorage<{ users: Record<string, number>; }>(createMMKVBackend("ENDCORD_VOICE_STATS", { users: {} })));

function VoiceStatsPage() {
    useProxy(voiceTime);
    const users = Object.entries(voiceTime.users ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 100);
    return <LogList
        title={t("Time in Voice Together")}
        empty={t("Time you spend in voice channels with people will show up here")}
        entries={users.map(([id, ms]) => ({ key: id, label: displayName(getUser(id) ?? { id }), subLabel: clock(ms) }))}
        onClear={() => void (voiceTime.users = {})}
    />;
}

const VoiceStats = definePlugin({
    id: "endcord.voice-stats",
    name: "VoiceStats",
    description: tx("Shows how long you've spent in voice with each user"),
    authors: [ENDCORD_AUTHOR],
    icon: "ClockIcon",
    tags: ["Voice", "Friends"],
    SettingsComponent: VoiceStatsPage,
    async start({ cleanup }) {
        await awaitStorage(voiceTime);
        const STEP = 15_000;
        // Counted in steps and saved at most every step, so a call costs a write every 15 seconds at most
        const timer = setInterval(() => {
            const others = Object.keys(statesIn(myVoiceChannel())).filter(id => id !== currentUserId());
            if (!others.length) return;
            const users = { ...(voiceTime.users ?? {}) };
            for (const id of others) users[id] = (users[id] ?? 0) + STEP;
            voiceTime.users = users;
        }, STEP);
        cleanup(
            () => clearInterval(timer),
            addMessageAction({
                key: "voice-stats",
                icon: "ClockIcon",
                label: message => t("Time in voice together: {time}", { time: clock(voiceTime.users?.[message.author?.id] ?? 0) }),
                visible: message => !!voiceTime.users?.[message.author?.id],
                onPress: () => { },
            }),
        );
    },
});

export default [CallTimer, WaitForSlot, WebcamStartNotifier, PullUserIntoVoice, VoiceChatUtilities, AntiMoveDeco, VoiceServerInfo, VoiceFakeDetector, VoiceStats];
