/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, subscribe } from "../common";
import { currentChannelId, playSound } from "../hooks";

const MOYAI_URL = "https://github.com/Equicord/Equibored/raw/main/sounds/moyai/moyai.mp3";

export default definePlugin({
    id: "endcord.moyai",
    name: "Moyai",
    description: tx("Plays a 🗿 sound effect whenever a moyai emoji is sent or reacted in the chat you have open"),
    authors: [ENDCORD_AUTHOR],
    tags: ["Fun"],
    settings: {
        volume: { type: "number", label: tx("Volume"), description: tx("From 0 to 100"), default: 50, min: 0, max: 100 },
        ignoreBlocked: { type: "boolean", label: tx("Ignore blocked users"), description: tx("Don't play the sound for blocked users"), default: true },
        triggerWhenUnfocused: { type: "boolean", label: tx("Only in the open chat"), description: tx("Only play it for the chat you have open"), default: true },
    },
    start({ store, cleanup }) {
        const boom = (channelId: string, count = 1) => {
            if (store.triggerWhenUnfocused && channelId !== currentChannelId()) return;
            for (let i = 0; i < Math.min(count, 10); i++) setTimeout(() => playSound(MOYAI_URL, store.volume / 100), i * 300);
        };
        cleanup(
            subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
                if (optimistic || !message?.content) return;
                const count = (message.content.match(/🗿|:moyai:/g) ?? []).length;
                if (count) boom(message.channel_id, count);
            }),
            subscribe("MESSAGE_REACTION_ADD", ({ channelId, emoji, userId }) => {
                if (emoji?.name === "🗿" && userId !== currentUserId()) boom(channelId);
            }),
        );
    },
});
