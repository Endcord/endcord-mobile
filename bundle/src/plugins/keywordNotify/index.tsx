/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { currentUserId, subscribe } from "../common";
import { currentChannelId, displayName, jumpTo } from "../hooks";
import { placeOf, preview } from "../shared/notify";
import LogList from "../ui/LogList";

interface Logged {
    id: string;
    channelId: string;
    author: string;
    content: string;
    at: number;
}

const keywordLog = wrapSync(createStorage<{ entries: Logged[]; }>(createMMKVBackend("ENDCORD_KEYWORD_LOG", { entries: [] })));

function KeywordLog() {
    useProxy(keywordLog);
    const entries = Array.isArray(keywordLog.entries) ? keywordLog.entries : [];
    return <LogList
        title={t("Recent Mentions")}
        empty={t("No keywords have been mentioned yet")}
        entries={entries.map(e => ({
            key: e.id,
            label: `${e.author}: ${preview(e.content, 80)}`,
            subLabel: `${placeOf(e.channelId)} · ${new Date(e.at).toLocaleString()}`,
            onPress: () => jumpTo(e.channelId, e.id),
        }))}
        onClear={() => void (keywordLog.entries = [])}
    />;
}

export default definePlugin({
    id: "endcord.keyword-notify",
    name: "KeywordNotify",
    description: tx("Sends a notification if a given message matches certain keywords or regexes"),
    icon: "BellIcon",
    tags: ["Notifications"],
    settings: {
        keywords: { type: "string", label: tx("Keywords"), description: tx("Comma-separated words or phrases to watch for"), default: "" },
        useRegex: { type: "boolean", label: tx("Regular expressions"), description: tx("Treat each keyword as a regular expression"), default: false },
        ignoreBots: { type: "boolean", label: tx("Ignore bots"), description: tx("Ignore messages from bots"), default: true },
        amountToKeep: { type: "number", label: tx("Messages to keep"), description: tx("Amount of messages to keep in the log"), default: 50, min: 1, max: 500 },
    },
    SettingsComponent: KeywordLog,
    async start({ store, cleanup }) {
        await awaitStorage(keywordLog);
        const matches = (text: string) => {
            const words = store.keywords.split(",").map(w => w.trim()).filter(Boolean);
            return words.some(w => {
                if (!store.useRegex) return text.toLowerCase().includes(w.toLowerCase());
                try {
                    return new RegExp(w, "i").test(text);
                } catch {
                    return false;
                }
            });
        };
        cleanup(subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
            if (optimistic || !message?.content || message.author?.id === currentUserId()) return;
            if (store.ignoreBots && message.author?.bot) return;
            if (!matches(message.content)) return;
            const author = displayName(message.author);
            const entry = { id: message.id, channelId: message.channel_id, author, content: message.content, at: Date.now() };
            keywordLog.entries = [entry, ...(keywordLog.entries ?? [])].slice(0, store.amountToKeep);
            if (message.channel_id !== currentChannelId()) {
                showToast(`${author} · ${placeOf(message.channel_id)}: ${preview(message.content, 80)}`, findAssetId("BellIcon"));
            }
        }));
    },
});
