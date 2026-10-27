/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore, subscribe } from "../common";
import { addMessageAction, displayName } from "../hooks";
import { join, myVoiceChannel, voiceActions } from "../shared/voice";

export default definePlugin({
    id: "endcord.follow-user",
    name: "FollowUser",
    description: tx("Follow someone from the message menu to always join the same voice channel as them"),
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
