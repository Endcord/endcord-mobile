/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";

import { definePlugin } from "../api";
import { currentUserId, subscribe } from "../common";
import { botMessage, command, displayName, getChannel, getUser, jumpTo } from "../hooks";
import { ids, preview } from "../shared/channels";
import LogList from "../ui/LogList";

interface Waiting {
    userId: string;
    at: number;
    preview: string;
}

const waiting = wrapSync(createStorage<{ chats: Record<string, Waiting>; }>(createMMKVBackend("ENDCORD_GHOSTED", { chats: {} })));

const waitingList = () => Object.entries(waiting.chats ?? {}).sort((a, b) => a[1].at - b[1].at);

function GhostedPage() {
    useProxy(waiting);
    return <LogList
        title={t("Waiting for Your Answer")}
        empty={t("Nobody is waiting for an answer from you 👻")}
        entries={waitingList().map(([channelId, w]) => ({
            key: channelId,
            label: `👻 ${displayName(getUser(w.userId) ?? { id: w.userId })}: ${preview(w.preview, 60)}`,
            subLabel: new Date(w.at).toLocaleString(),
            onPress: () => {
                const last = getChannel(channelId)?.lastMessageId;
                if (last) jumpTo(channelId, last);
            },
        }))}
    />;
}

export default definePlugin({
    id: "endcord.ghosted",
    name: "Ghosted",
    description: tx("Keeps a list of the DMs you haven't answered yet, with a ghost for each"),
    icon: "ChatIcon",
    tags: ["Friends", "Chat"],
    settings: {
        ignoreGroupDms: { type: "boolean", label: tx("Not group DMs"), description: tx("Exclude all group dms from ghosting"), default: true },
        exemptedChannels: { type: "string", label: tx("Never ghosted"), description: tx("Channel IDs, separated by commas, that are never listed"), default: "" },
    },
    SettingsComponent: GhostedPage,
    async start({ store, cleanup }) {
        await awaitStorage(waiting);
        cleanup(
            subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
                const channel = message && getChannel(message.channel_id);
                if (!channel || channel.guild_id || optimistic && message.author?.id !== currentUserId()) return;
                if (store.ignoreGroupDms && channel.type === 3 || ids(store.exemptedChannels).has(channel.id)) return;
                const mine = message.author?.id === currentUserId();
                // Saved only when the list changes, not for every message of a conversation
                if (mine && !waiting.chats?.[channel.id] || !mine && message.author?.bot) return;
                const chats = { ...(waiting.chats ?? {}) };
                if (mine) delete chats[channel.id];
                // Waiting since their first unanswered message, showing the latest
                else chats[channel.id] = { userId: message.author.id, at: chats[channel.id]?.at ?? Date.now(), preview: message.content || t("Sent an attachment") };
                waiting.chats = chats;
            }),
            command({
                name: "ghosted",
                description: tx("See who is waiting for your answer (only you see it)"),
                run: (_, ctx) => {
                    const list = waitingList();
                    botMessage(ctx.channel.id, list.length
                        ? list.slice(0, 25).map(([id, w]) => `👻 <@${w.userId}> · <#${id}> · <t:${Math.floor(w.at / 1000)}:R>`).join("\n")
                        : t("Nobody is waiting for an answer from you 👻"));
                },
            }),
        );
    },
});
