/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { AppState, Vibration } from "react-native";

import { definePlugin } from "../api";
import { currentUserId, getStore, subscribe } from "../common";

const PATTERNS: Record<string, number[]> = { short: [0, 60], double: [0, 70, 90, 70], long: [0, 350] };

export default definePlugin({
    id: "endcord.vibrate-on-ping",
    name: "VibrateOnPing",
    description: tx("Vibrates your phone when someone mentions you or DMs you while Discord is open"),
    icon: "BellIcon",
    tags: ["Notifications"],
    settings: {
        dms: { type: "boolean", label: tx("Direct messages too"), default: true },
        pattern: {
            type: "select",
            label: tx("Vibration"),
            default: "double",
            options: [{ label: tx("Short"), value: "short" }, { label: tx("Double"), value: "double" }, { label: tx("Long"), value: "long" }],
        },
    },
    start({ store, cleanup }) {
        let last = 0;
        cleanup(subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
            const me = currentUserId();
            if (optimistic || !message || !me || message.author?.id === me || AppState.currentState !== "active") return;
            // Do Not Disturb means no nudges
            if (getStore("PresenceStore")?.getStatus?.(me) === "dnd") return;
            const channel = getStore("ChannelStore")?.getChannel?.(message.channel_id);
            const direct = (message.mentions ?? []).some((u: any) => (u?.id ?? u) === me);
            const dm = store.dms && channel && !channel.guild_id;
            if (!direct && !dm) return;
            // The channel you're reading doesn't need a nudge, nor does a burst of messages
            if (getStore("SelectedChannelStore")?.getChannelId?.() === message.channel_id || Date.now() - last < 3000) return;
            last = Date.now();
            Vibration.vibrate(PATTERNS[store.pattern] ?? PATTERNS.double);
        }));
    },
});
