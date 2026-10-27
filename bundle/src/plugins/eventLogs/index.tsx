/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";

import { definePlugin } from "../api";
import { getStore, onAction, subscribe } from "../common";
import { displayName, getChannel, getGuild, getUser, jumpTo } from "../hooks";
import { preview } from "../shared/account";
import LogList from "../ui/LogList";

interface LogEvent {
    at: number;
    kind: "deleted" | "edited" | "friend" | "server";
    text: string;
    channelId?: string;
    messageId?: string;
}

const events = wrapSync(createStorage<{ items: LogEvent[]; }>(createMMKVBackend("ENDCORD_EVENT_LOGS", { items: [] })));

const ICONS: Record<LogEvent["kind"], string> = { deleted: "TrashIcon", edited: "PencilIcon", friend: "FriendsIcon", server: "ServerIcon" };

function EventLogsPage() {
    useProxy(events);
    const items = Array.isArray(events.items) ? events.items : [];
    return <LogList
        title={t("Event Logs")}
        empty={t("Deleted and edited messages, friends and servers will be logged here")}
        entries={items.map((e, i) => ({
            key: `${e.at}-${i}`,
            label: e.text,
            subLabel: new Date(e.at).toLocaleString(),
            icon: ICONS[e.kind],
            onPress: e.channelId && e.messageId ? () => jumpTo(e.channelId!, e.messageId!) : undefined,
        }))}
        onClear={() => void (events.items = [])}
    />;
}

export default definePlugin({
    id: "endcord.event-logs",
    name: "EventLogs",
    description: tx("Keeps a log of deleted and edited messages, friends added and removed, and servers you join and leave"),
    icon: "BookCheckIcon",
    tags: ["Utility"],
    settings: {
        keep: { type: "number", label: tx("Events to keep"), description: tx("Older events are removed"), default: 200, min: 20, max: 2000 },
        messages: { type: "boolean", label: tx("Messages"), description: tx("Log deleted and edited messages"), default: true },
        friends: { type: "boolean", label: tx("Friends"), description: tx("Log friends added and removed"), default: true },
        servers: { type: "boolean", label: tx("Servers"), description: tx("Log servers you join and leave"), default: true },
    },
    SettingsComponent: EventLogsPage,
    async start({ store, cleanup }) {
        await awaitStorage(events);
        // Batched, so a burst of deletes is one write
        let pending: LogEvent[] = [];
        let timer: ReturnType<typeof setTimeout> | undefined;
        const add = (e: Omit<LogEvent, "at">) => {
            pending.push({ ...e, at: Date.now() });
            timer ??= setTimeout(() => {
                timer = undefined;
                events.items = [...pending.reverse(), ...(events.items ?? [])].slice(0, store.keep);
                pending = [];
            }, 1000);
        };
        const message = (channelId: string, id: string) => getStore("MessageStore")?.getMessage?.(channelId, id);
        const where = (channelId: string) => {
            const channel = getChannel(channelId);
            return channel?.guild_id ? `#${channel.name}` : t("Direct Message");
        };
        cleanup(
            () => clearTimeout(timer),
            onAction<{ id: string; channelId: string; endcordLocal?: boolean; }>("MESSAGE_DELETE", ({ id, channelId, endcordLocal }) => {
                const m = !endcordLocal && store.messages ? message(channelId, id) : undefined;
                if (m?.content) add({ kind: "deleted", text: `${t("Deleted")} · ${displayName(m.author)} · ${where(channelId)}: ${preview(m.content)}`, channelId, messageId: id });
            }, { first: true }),
            onAction<{ message?: any; }>("MESSAGE_UPDATE", ({ message: update }) => {
                if (!store.messages || update?.content === undefined) return;
                const m = message(update.channel_id, update.id);
                if (m?.content && m.content !== update.content) add({ kind: "edited", text: `${t("Edited")} · ${displayName(m.author)} · ${where(update.channel_id)}: ${preview(m.content)} → ${preview(update.content)}`, channelId: update.channel_id, messageId: update.id });
            }, { first: true }),
            subscribe("RELATIONSHIP_ADD", ({ relationship }) => {
                if (store.friends && relationship?.type === 1) add({ kind: "friend", text: t("{user} is now your friend", { user: displayName(relationship.user ?? getUser(relationship.id)) }) });
            }),
            subscribe("RELATIONSHIP_REMOVE", ({ relationship }) => {
                if (store.friends && relationship?.type === 1) add({ kind: "friend", text: t("{user} is no longer your friend", { user: displayName(getUser(relationship.id) ?? { id: relationship.id }) }) });
            }),
            onAction<{ guild?: { id: string; unavailable?: boolean; }; }>("GUILD_DELETE", ({ guild }) => {
                if (store.servers && guild && !guild.unavailable) add({ kind: "server", text: t("You left {server}", { server: getGuild(guild.id)?.name ?? guild.id }) });
            }, { first: true }),
            subscribe("GUILD_CREATE", ({ guild }) => {
                const joined = Date.parse(guild?.joined_at ?? guild?.joinedAt ?? "");
                if (store.servers && Date.now() - joined < 60_000) add({ kind: "server", text: t("You joined {server}", { server: guild.name }) });
            }),
        );
    },
});
