/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { subscribe } from "../common";
import { getChannel } from "../hooks";
import { join, myVoiceChannel } from "../shared/voice";

const lastCall = wrapSync(createStorage<{ channelId?: string; at?: number; }>(createMMKVBackend("ENDCORD_VOICE_REJOIN", {})));

export default definePlugin({
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
