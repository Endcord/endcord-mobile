/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { before } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, onAction, subscribe } from "../common";
import { getChannel, MessageActions, send } from "../hooks";
import { ids } from "../shared/notify";

interface Protected {
    channelId: string;
    guildId?: string;
    content: string;
}

export default definePlugin({
    id: "endcord.anti-delete-message",
    name: "AntiDeleteMessage",
    description: tx("Automatically resends your messages if someone deletes them. Cache persisted across restarts."),
    authors: [ENDCORD_AUTHOR],
    icon: "ShieldIcon",
    tags: ["Chat", "Utility"],
    settings: {
        enabled: { type: "boolean", label: tx("Resend deleted messages"), description: tx("Enable automatic message restoration"), default: true },
        dmProtection: { type: "boolean", label: tx("In DMs too"), description: tx("Also protect DMs (not just servers)"), default: false },
        maxCacheSize: { type: "number", label: tx("Messages to remember"), description: tx("Maximum number of messages kept in cache"), default: 300, min: 10, max: 5000 },
        serverBlacklist: { type: "string", label: tx("Servers to skip"), description: tx("Server IDs to ignore (comma-separated). Messages sent in these servers will NOT be resent."), default: "" },
    },
    async start({ store, cleanup }) {
        const cache = wrapSync(createStorage<{ messages: Record<string, Protected>; }>(createMMKVBackend("ENDCORD_ANTI_DELETE", { messages: {} })));
        await awaitStorage(cache);
        const deletedByMe = new Set<string>();
        // A bot or a moderator that deletes the message again each time would get it resent forever, which reads as
        // spam and can get the account banned: the same text goes out at most twice in ten minutes, and nothing more
        // than five times a minute
        const resentTexts = new Map<string, number[]>();
        const resentAt: number[] = [];
        const mayResend = (content: string) => {
            const now = Date.now();
            const forText = (resentTexts.get(content) ?? []).filter(at => now - at < 600_000);
            while (resentAt.length && now - resentAt[0] >= 60_000) resentAt.shift();
            if (forText.length >= 2 || resentAt.length >= 5) return false;
            forText.push(now);
            resentAt.push(now);
            resentTexts.set(content, forText);
            return true;
        };
        const actions = MessageActions();
        if (typeof actions?.deleteMessage === "function") {
            cleanup(before("deleteMessage", actions, ([, messageId]: any[]) => void deletedByMe.add(messageId)));
        }
        cleanup(
            subscribe("MESSAGE_CREATE", ({ message, guildId, optimistic }) => {
                if (optimistic || message?.author?.id !== currentUserId() || !message.content) return;
                const guild = guildId ?? message.guild_id ?? getChannel(message.channel_id)?.guild_id;
                if (!guild && !store.dmProtection) return;
                const messages: Record<string, Protected> = { ...(cache.messages ?? {}), [message.id]: { channelId: message.channel_id, guildId: guild, content: message.content } };
                const keys = Object.keys(messages);
                for (const key of keys.slice(0, Math.max(0, keys.length - store.maxCacheSize))) delete messages[key];
                cache.messages = messages;
            }),
            onAction<{ id: string; channelId: string; endcordLocal?: boolean; }>("MESSAGE_DELETE", ({ id, channelId, endcordLocal }) => {
                const saved = cache.messages?.[id];
                if (!saved || !store.enabled || endcordLocal) return;
                const { [id]: _, ...rest } = cache.messages;
                cache.messages = rest;
                if (deletedByMe.delete(id) || saved.guildId && ids(store.serverBlacklist).has(saved.guildId)) return;
                if (!mayResend(saved.content)) {
                    showToast(t("A message of yours keeps being deleted, so it wasn't sent again"), findAssetId("ShieldIcon"));
                    return;
                }
                setTimeout(() => send(channelId ?? saved.channelId, saved.content), 500);
            }, { first: true }),
        );
    },
});
