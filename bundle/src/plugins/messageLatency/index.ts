/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId } from "../common";
import { appendToTimestamp, onMessageRow, snowflakeTime } from "../hooks";

export default definePlugin({
    id: "endcord.message-latency",
    name: "MessageLatency",
    description: tx("Displays an indicator for messages that took ≥n seconds to send"),
    authors: [ENDCORD_AUTHOR],
    icon: "TimerIcon",
    tags: ["Chat", "Utility"],
    settings: {
        latency: { type: "number", label: tx("Threshold (seconds)"), description: tx("Threshold in seconds for latency indicator"), default: 2, min: 0, max: 60 },
        showMillis: { type: "boolean", label: tx("Show milliseconds"), description: tx("Show milliseconds"), default: false },
        ignoreSelf: { type: "boolean", label: tx("Not on my messages"), description: tx("Don't add indicator to your own messages"), default: false },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("message-latency", (row, message) => {
            const nonce = String(message.nonce ?? "");
            if (!/^\d{17,20}$/.test(nonce) || store.ignoreSelf && message.author?.id === currentUserId()) return;
            const delta = snowflakeTime(message.id) - snowflakeTime(nonce);
            // Clients that make nonces another way give nonsense; Discord drops anything over a few minutes old
            if (delta < store.latency * 1000 || delta > 600_000) return;
            const seconds = delta / 1000;
            appendToTimestamp(row, ` · ⏱ ${store.showMillis ? seconds.toFixed(3) : seconds.toFixed(1)}s`);
        }));
    },
});
