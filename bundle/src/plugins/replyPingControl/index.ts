/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { currentUserId, getStore } from "../common";
import { onIncomingMessage } from "../hooks";
import { ids } from "../shared/filters";

export default definePlugin({
    id: "endcord.reply-ping-control",
    name: "ReplyPingControl",
    description: tx("Control whether to always or never get pinged on message replies, with whitelist and blacklist features"),
    icon: "AtIcon",
    tags: ["Notifications"],
    settings: {
        alwaysPingOnReply: { type: "boolean", label: tx("Always ping me on replies"), description: tx("Always get pinged when someone replies to your messages"), default: false },
        replyPingWhitelist: { type: "string", label: tx("Always ping from"), description: tx("Comma-separated list of User IDs to always receive reply pings from"), default: "" },
        replyPingBlacklist: { type: "string", label: tx("Never ping from"), description: tx("Comma-separated list of User IDs to never receive reply pings from"), default: "" },
    },
    start({ store, cleanup }) {
        cleanup(onIncomingMessage("reply-ping-control", message => {
            const me = currentUserId();
            const author = message.author?.id;
            if (!me || author === me || message.referenced_message?.author?.id !== me) return;
            const mentions: any[] = message.mentions ?? [];
            const mentioned = mentions.some(u => (u?.id ?? u) === me);
            if (ids(store.replyPingBlacklist).has(author)) {
                // Mentions written in the message still ping; only the reply's own ping goes
                if (!mentioned || new RegExp(`<@!?${me}>`).test(message.content ?? "")) return;
                return { ...message, mentions: mentions.filter(u => (u?.id ?? u) !== me) };
            }
            if (!mentioned && (store.alwaysPingOnReply || ids(store.replyPingWhitelist).has(author))) {
                const self = getStore("UserStore")?.getCurrentUser?.();
                return { ...message, mentions: [...mentions, { id: me, username: self?.username, discriminator: self?.discriminator ?? "0", avatar: self?.avatar ?? null }] };
            }
        }));
    },
});
