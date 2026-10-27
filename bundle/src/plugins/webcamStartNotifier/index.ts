/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, subscribe } from "../common";
import { displayName, getChannel, getUser, playSound } from "../hooks";
import { myVoiceChannel } from "../shared/calls";

export default definePlugin({
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
