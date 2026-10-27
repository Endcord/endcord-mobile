/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { subscribe } from "../common";
import { botMessage, command, getChannel } from "../hooks";
import { statesIn, voiceActions } from "../shared/calls";

export default definePlugin({
    id: "endcord.wait-for-slot",
    name: "WaitForSlot",
    description: tx("Automatically join a full voice channel when a slot opens."),
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
