/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findByProps } from "@metro";
import { FluxDispatcher } from "@metro/common";

import { definePlugin } from "../api";
import { currentUserId, getStore, subscribe } from "../common";
import { botMessage, command } from "../hooks";
import { myVoiceChannel } from "../shared/activity";

function setUserVolume(userId: string, volume: number) {
    const actions = findByProps("setLocalVolume");
    if (actions?.setLocalVolume) actions.setLocalVolume(userId, volume, "default");
    else FluxDispatcher.dispatch({ type: "AUDIO_SET_LOCAL_VOLUME", userId, volume, context: "default" });
}

export default definePlugin({
    id: "endcord.universal-volume",
    name: "UniversalVolume",
    description: tx("Sets everyone in your voice channel to the same volume, and keeps new people who join at that level too."),
    icon: "VoiceNormalIcon",
    tags: ["Voice"],
    settings: {
        volume: { type: "number", label: tx("Volume (%)"), default: 100, min: 0, max: 200 },
    },
    start({ store, cleanup }) {
        const done = new Set<string>();
        const apply = () => {
            const channelId = myVoiceChannel();
            if (!channelId) return done.clear();
            const me = currentUserId();
            const states = getStore("VoiceStateStore")?.getVoiceStatesForChannel?.(channelId) ?? {};
            for (const userId of Object.keys(states)) {
                if (userId === me || done.has(userId)) continue;
                done.add(userId);
                setUserVolume(userId, store.volume);
            }
        };
        cleanup(
            subscribe("VOICE_STATE_UPDATES", apply),
            subscribe("VOICE_CHANNEL_SELECT", () => {
                done.clear();
                setTimeout(apply, 500);
            }),
            command({
                name: "universalvolume",
                description: tx("Set everyone in your voice channel to one volume"),
                options: [{ name: "volume", description: tx("From 0 to 200; 100 is normal"), type: "integer", required: true }],
                run: ({ volume }, ctx) => {
                    store.volume = Math.min(200, Math.max(0, Number(volume)));
                    done.clear();
                    apply();
                    botMessage(ctx.channel.id, t("Everyone in your voice channel is at {volume}%.", { volume: store.volume }));
                },
            }),
        );
        apply();
    },
});
