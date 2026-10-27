/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";

import { definePlugin } from "../api";
import { subscribe } from "../common";
import { botMessage, command, getChannel, messageLink } from "../hooks";
import { preview } from "../shared/messages";

interface Indexed {
    i: string;
    c: string;
    a: string;
    n: string;
    t: number;
    x: string;
}

const vault = wrapSync(createStorage<{ items: Indexed[]; }>(createMMKVBackend("ENDCORD_MESSAGE_VAULT", { items: [] })));

export default definePlugin({
    id: "endcord.message-vault",
    name: "MessageVault",
    description: tx("Search messages you have read by keyword and person with /vault, even after they scroll away. Indexed on your device only."),
    icon: "MagnifyingGlassIcon",
    tags: ["Utility", "Chat"],
    settings: {
        indexServers: { type: "boolean", label: tx("Servers"), description: tx("Index messages from servers"), default: true },
        indexDirectMessages: { type: "boolean", label: tx("Direct messages"), description: tx("Index direct messages"), default: true },
        keep: { type: "number", label: tx("Messages to keep"), description: tx("Older ones are removed"), default: 3000, min: 100, max: 20000 },
    },
    async start({ store, cleanup }) {
        await awaitStorage(vault);
        const seen = new Set((vault.items ?? []).map(m => m.i));
        let pending: Indexed[] = [];
        // Written every half minute at most, so reading a busy chat doesn't mean constant writes
        const timer = setInterval(() => {
            if (!pending.length) return;
            vault.items = [...pending, ...(vault.items ?? [])].slice(0, store.keep);
            pending = [];
        }, 30_000);
        const index = (m: any) => {
            if (!m?.id || !m.content || seen.has(m.id)) return;
            const guild = getChannel(m.channel_id)?.guild_id;
            if (guild ? !store.indexServers : !store.indexDirectMessages) return;
            seen.add(m.id);
            pending.push({ i: m.id, c: m.channel_id, a: m.author?.id, n: m.author?.global_name ?? m.author?.username ?? "?", t: Date.parse(m.timestamp) || Date.now(), x: m.content.slice(0, 500) });
        };
        cleanup(
            () => {
                clearInterval(timer);
                if (pending.length) vault.items = [...pending, ...(vault.items ?? [])].slice(0, store.keep);
            },
            subscribe("MESSAGE_CREATE", ({ message }) => index(message)),
            subscribe("LOAD_MESSAGES_SUCCESS", ({ messages }) => (messages ?? []).forEach(index)),
            command({
                name: "vault",
                description: tx("Search the messages you have read (only you see the results)"),
                options: [
                    { name: "text", description: tx("Words to look for"), required: true },
                    { name: "from", description: tx("Only messages from this person"), type: "user" },
                ],
                run: ({ text, from }, ctx) => {
                    const words = String(text).toLowerCase().split(/\s+/).filter(Boolean);
                    const results = [...pending, ...(vault.items ?? [])]
                        .filter(m => (!from || m.a === from) && words.every(w => m.x.toLowerCase().includes(w)))
                        .slice(0, 15);
                    botMessage(ctx.channel.id, results.length
                        ? results.map(m => `**${m.n}** <t:${Math.floor(m.t / 1000)}:R>: ${preview(m.x, 120)}\n${messageLink(m.c, m.i)}`).join("\n")
                        : t("Nothing found for \"{text}\".", { text }));
                },
            }),
        );
    },
});
