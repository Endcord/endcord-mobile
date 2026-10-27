/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore, subscribe } from "../common";
import { api, getChannel } from "../hooks";
import { canHere } from "../shared/servers";

const ids = (text: string) => new Set(text.split(/[\s,]+/).filter(Boolean));

export default definePlugin({
    id: "endcord.auto-disconnect-and-auto-mute",
    name: "AutoDisconnectAndAutoMute",
    description: tx("Automatically disconnect or mute selected users from voice channels"),
    icon: "VoiceNormalIcon",
    tags: ["Voice", "Servers"],
    settings: {
        users: { type: "string", label: tx("Users"), description: tx("User IDs separated by commas"), placeholder: tx("e.g. 123456789012345678, 234567890123456789"), default: "" },
        action: {
            type: "select",
            label: tx("What to do when they join a voice channel you can moderate"),
            default: "mute",
            options: [{ label: tx("Server mute them"), value: "mute" }, { label: tx("Server deafen them"), value: "deafen" }, { label: tx("Disconnect them"), value: "disconnect" }],
        },
        onlyMyChannel: { type: "boolean", label: tx("Only in my channel"), description: tx("Only act when they join the voice channel you're in"), default: true },
    },
    start({ store, cleanup }) {
        const handled = new Set<string>();
        cleanup(subscribe("VOICE_STATE_UPDATES", ({ voiceStates }) => {
            const mine = getStore("SelectedChannelStore")?.getVoiceChannelId?.();
            for (const state of voiceStates ?? []) {
                const key = `${state.userId}:${state.channelId}`;
                if (!state.channelId || !state.guildId || !ids(store.users).has(state.userId) || handled.has(key)) continue;
                if (store.onlyMyChannel && state.channelId !== mine) continue;
                const channel = getChannel(state.channelId);
                const body = store.action === "disconnect" ? { channel_id: null } : store.action === "deafen" ? { deaf: true } : { mute: true };
                const needed = store.action === "disconnect" ? "MOVE_MEMBERS" : store.action === "deafen" ? "DEAFEN_MEMBERS" : "MUTE_MEMBERS";
                if (!canHere(needed, channel)) continue;
                if (store.action === "mute" && state.mute || store.action === "deafen" && state.deaf) continue;
                handled.add(key);
                setTimeout(() => handled.delete(key), 10_000);
                api("patch", `/guilds/${state.guildId}/members/${state.userId}`, body).catch(() => { });
            }
        }));
    },
});
