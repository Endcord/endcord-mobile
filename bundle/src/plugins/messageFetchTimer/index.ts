/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { onAction } from "../common";
import { currentChannelId } from "../hooks";

export default definePlugin({
    id: "endcord.message-fetch-timer",
    name: "MessageFetchTimer",
    description: tx("Shows how long it took to fetch messages for the current channel"),
    icon: "TimerIcon",
    tags: ["Utility"],
    settings: {
        showMs: { type: "boolean", label: tx("Milliseconds"), description: tx("Show milliseconds in timing"), default: true },
    },
    start({ store, cleanup }) {
        const started = new Map<string, number>();
        cleanup(
            onAction<{ channelId: string; }>("LOAD_MESSAGES", ({ channelId }) => void started.set(channelId, Date.now())),
            onAction<{ channelId: string; }>("LOAD_MESSAGES_SUCCESS", ({ channelId }) => {
                const at = started.get(channelId);
                if (!at) return;
                started.delete(channelId);
                if (channelId !== currentChannelId()) return;
                const ms = Date.now() - at;
                showToast(t("Messages loaded in {time}", { time: store.showMs ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s` }), findAssetId("TimerIcon"));
            }),
        );
    },
});
