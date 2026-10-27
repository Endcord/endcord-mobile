/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, subscribe } from "../common";
import { currentChannelId, openUrl } from "../hooks";

export default definePlugin({
    id: "endcord.hop-on",
    name: "HopOn",
    description: tx("Hop on! Opens a configurable URL when a message matches a custom regex in the current channel."),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkExternalSmallIcon",
    tags: ["Fun", "Utility"],
    settings: {
        regex: { type: "string", label: tx("Pattern"), description: tx("Regex to trigger on"), default: "\\bhop on\\b" },
        url: { type: "string", label: tx("Link"), description: tx("URL to open"), placeholder: "https://…", default: "" },
    },
    start({ store, cleanup }) {
        let lastOpened = 0;
        cleanup(subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
            if (optimistic || !message?.content || message.channel_id !== currentChannelId() || message.author?.id === currentUserId()) return;
            if (!/^https?:\/\//.test(store.url.trim()) || Date.now() - lastOpened < 10_000) return;
            try {
                if (!new RegExp(store.regex, "i").test(message.content)) return;
            } catch {
                return;
            }
            lastOpened = Date.now();
            openUrl(store.url.trim());
        }));
    },
});
