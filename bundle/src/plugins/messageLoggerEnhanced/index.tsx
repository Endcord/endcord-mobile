/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore, onAction } from "../common";
import { botMessage, command, displayName, getChannel, jumpTo } from "../hooks";
import { preview } from "../shared/messages";
import LogList from "../ui/LogList";

interface Archived {
    id: string;
    channelId: string;
    author: string;
    content: string;
    at: number;
    kind: "deleted" | "edited";
    before?: string;
}

const archive = wrapSync(createStorage<{ items: Archived[]; }>(createMMKVBackend("ENDCORD_MESSAGE_ARCHIVE", { items: [] })));

const archived = () => Array.isArray(archive.items) ? archive.items : [];

function ArchivePage() {
    useProxy(archive);
    return <LogList
        title={t("Deleted and Edited Messages")}
        empty={t("Deleted and edited messages are kept here, even after Discord restarts")}
        entries={archived().map((m, i) => ({
            key: `${m.id}-${i}`,
            label: `${m.kind === "deleted" ? "🗑" : "✏️"} ${m.author}: ${preview(m.kind === "edited" ? `${m.before} → ${m.content}` : m.content)}`,
            subLabel: `${getChannel(m.channelId)?.name ? `#${getChannel(m.channelId).name}` : t("Direct Message")} · ${new Date(m.at).toLocaleString()}`,
            onPress: () => jumpTo(m.channelId, m.id),
        }))}
        onClear={() => void (archive.items = [])}
    />;
}

export default definePlugin({
    id: "endcord.message-logger-enhanced",
    name: "MessageLoggerEnhanced",
    description: tx("Keeps deleted and edited messages after Discord restarts, with a list to browse them and /deleted"),
    authors: [ENDCORD_AUTHOR],
    icon: "TrashIcon",
    tags: ["Chat", "Utility"],
    settings: {
        keep: { type: "number", label: tx("Messages to keep"), description: tx("Older ones are removed"), default: 500, min: 50, max: 5000 },
        ignoreSelf: { type: "boolean", label: tx("Ignore yourself"), description: tx("Don't log your own messages"), default: true },
        ignoreBots: { type: "boolean", label: tx("Ignore bots"), description: tx("Don't log messages from bots"), default: true },
    },
    SettingsComponent: ArchivePage,
    async start({ store, cleanup }) {
        await awaitStorage(archive);
        let pending: Archived[] = [];
        let timer: ReturnType<typeof setTimeout> | undefined;
        const add = (item: Archived) => {
            pending.push(item);
            timer ??= setTimeout(() => {
                timer = undefined;
                archive.items = [...pending.reverse(), ...archived()].slice(0, store.keep);
                pending = [];
            }, 1000);
        };
        const skip = (m: any) => !m?.content || store.ignoreSelf && m.author?.id === currentUserId() || store.ignoreBots && m.author?.bot;
        cleanup(
            () => clearTimeout(timer),
            onAction<{ id: string; channelId: string; endcordLocal?: boolean; }>("MESSAGE_DELETE", ({ id, channelId, endcordLocal }) => {
                const m = endcordLocal ? undefined : getStore("MessageStore")?.getMessage?.(channelId, id);
                if (m && !skip(m)) add({ id, channelId, author: displayName(m.author), content: m.content, at: Date.now(), kind: "deleted" });
            }, { first: true }),
            onAction<{ message?: any; }>("MESSAGE_UPDATE", ({ message: update }) => {
                if (update?.content === undefined) return;
                const m = getStore("MessageStore")?.getMessage?.(update.channel_id, update.id);
                if (m && !skip(m) && m.content !== update.content) add({ id: m.id, channelId: m.channel_id, author: displayName(m.author), content: update.content, before: m.content, at: Date.now(), kind: "edited" });
            }, { first: true }),
            command({
                name: "deleted",
                description: tx("Show the messages deleted in this chat (only you see it)"),
                run: (_, ctx) => {
                    const here = archived().filter(m => m.channelId === ctx.channel.id && m.kind === "deleted").slice(0, 20);
                    botMessage(ctx.channel.id, here.length
                        ? here.map(m => `🗑 **${m.author}** <t:${Math.floor(m.at / 1000)}:R>: ${preview(m.content, 200)}`).join("\n")
                        : t("No deleted messages from this chat were kept."));
                },
            }),
        );
    },
});
