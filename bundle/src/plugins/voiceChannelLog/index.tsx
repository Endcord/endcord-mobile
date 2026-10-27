/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { useEffect, useState } from "react";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore, onAction } from "../common";
import { displayName, getChannel, getUser } from "../hooks";
import LogList from "../ui/LogList";

interface VoiceEvent {
    key: string;
    text: string;
    channelId: string;
    at: number;
}

const voiceLog: VoiceEvent[] = [];

let notifyVoiceLog: (() => void) | undefined;

function VoiceLog() {
    const [, setTick] = useState(0);
    useEffect(() => {
        notifyVoiceLog = () => setTick(n => n + 1);
        return () => void (notifyVoiceLog = undefined);
    }, []);
    return <LogList
        title={t("Voice Activity")}
        empty={t("Nothing has happened in voice channels yet")}
        entries={[...voiceLog].reverse().map(e => ({ key: e.key, label: e.text, subLabel: new Date(e.at).toLocaleTimeString() }))}
        onClear={() => {
            voiceLog.length = 0;
            notifyVoiceLog?.();
        }}
    />;
}

export default definePlugin({
    id: "endcord.voice-channel-log",
    name: "VoiceChannelLog",
    description: tx("Logs voice channel activity: joins, leaves, moves, server mutes, cameras and screen shares"),
    authors: [ENDCORD_AUTHOR],
    icon: "VoiceNormalIcon",
    tags: ["Voice"],
    settings: {
        logJoinLeave: { type: "boolean", label: tx("Joins and leaves"), description: tx("Log when users join, leave, or move between voice channels."), default: true },
        logMuteDeafen: { type: "boolean", label: tx("Server mutes and deafens"), description: tx("Log when users are server muted or deafened."), default: true },
        logVideo: { type: "boolean", label: tx("Cameras"), description: tx("Log when users turn their camera on or off."), default: true },
        logStream: { type: "boolean", label: tx("Screen shares"), description: tx("Log when users start or stop screensharing."), default: true },
        ignoreBlockedUsers: { type: "boolean", label: tx("Ignore blocked users"), description: tx("Do not log blocked users."), default: true },
        toasts: { type: "boolean", label: tx("Toasts for my channel"), description: tx("Also show a toast when something happens in the voice channel you're in"), default: true },
    },
    SettingsComponent: VoiceLog,
    start({ store, cleanup }) {
        cleanup(() => void (voiceLog.length = 0), onAction<{ voiceStates: any[]; }>("VOICE_STATE_UPDATES", ({ voiceStates }) => {
            const voiceStore = getStore("VoiceStateStore");
            const myChannel = getStore("SelectedChannelStore")?.getVoiceChannelId?.();
            for (const state of voiceStates ?? []) {
                if (store.ignoreBlockedUsers && getStore("RelationshipStore")?.isBlocked?.(state.userId)) continue;
                const before = voiceStore?.getVoiceStateForUser?.(state.userId);
                const name = displayName(getUser(state.userId) ?? { id: state.userId });
                const channelName = (id?: string | null) => id ? `#${getChannel(id)?.name ?? "?"}` : "";
                const events: string[] = [];
                if (store.logJoinLeave && before?.channelId !== state.channelId) {
                    if (!before?.channelId) events.push(t("{user} joined {channel}", { user: name, channel: channelName(state.channelId) }));
                    else if (!state.channelId) events.push(t("{user} left {channel}", { user: name, channel: channelName(before.channelId) }));
                    else events.push(t("{user} moved from {from} to {to}", { user: name, from: channelName(before.channelId), to: channelName(state.channelId) }));
                }
                if (before?.channelId && before.channelId === state.channelId) {
                    if (store.logMuteDeafen && !!before.mute !== !!state.mute) events.push(state.mute ? t("{user} was server muted", { user: name }) : t("{user} was server unmuted", { user: name }));
                    if (store.logMuteDeafen && !!before.deaf !== !!state.deaf) events.push(state.deaf ? t("{user} was server deafened", { user: name }) : t("{user} was server undeafened", { user: name }));
                    if (store.logVideo && !!before.selfVideo !== !!state.selfVideo) events.push(state.selfVideo ? t("{user} turned on their camera", { user: name }) : t("{user} turned off their camera", { user: name }));
                    if (store.logStream && !!before.selfStream !== !!state.selfStream) events.push(state.selfStream ? t("{user} started sharing their screen", { user: name }) : t("{user} stopped sharing their screen", { user: name }));
                }
                for (const text of events) {
                    voiceLog.push({ key: `${Date.now()}-${voiceLog.length}`, text, channelId: state.channelId ?? before?.channelId, at: Date.now() });
                    if (voiceLog.length > 200) voiceLog.shift();
                    const involvesMine = myChannel && (state.channelId === myChannel || before?.channelId === myChannel);
                    if (store.toasts && involvesMine && state.userId !== currentUserId()) showToast(text, findAssetId("VoiceNormalIcon"));
                }
                if (events.length) notifyVoiceLog?.();
            }
        }));
    },
});
