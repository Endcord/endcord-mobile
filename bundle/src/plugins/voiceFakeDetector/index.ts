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
import { displayName, getUser } from "../hooks";
import { myVoiceChannel, statesIn } from "../shared/calls";

export default definePlugin({
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
