/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";

import { definePlugin } from "../api";
import { currentUserId, subscribe } from "../common";
import { getChannel, localDay, onMessageRow } from "../hooks";

interface Streak {
    day: string;
    mine: boolean;
    theirs: boolean;
    count: number;
    last?: string;
}

const streaks = wrapSync(createStorage<{ users: Record<string, Streak>; }>(createMMKVBackend("ENDCORD_STREAKS", { users: {} })));

const dayOf = (ms: number) => localDay(ms);

const current = (s?: Streak) => {
    if (!s?.last) return 0;
    const today = dayOf(Date.now()), yesterday = dayOf(Date.now() - 86_400_000);
    return s.last === today || s.last === yesterday ? s.count : 0;
};

export default definePlugin({
    id: "endcord.streaks",
    name: "Streaks",
    description: tx("Shows a streak next to a user when you exchange DMs with them on consecutive days."),
    icon: "StarIcon",
    tags: ["Friends", "Fun"],
    settings: {
        minimum: { type: "number", label: tx("Shortest streak shown"), description: tx("Streaks shorter than this many days aren't shown"), default: 2, min: 1, max: 365 },
    },
    async start({ store, cleanup }) {
        await awaitStorage(streaks);
        cleanup(
            subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
                const channel = message && getChannel(message.channel_id);
                if (!channel || channel.type !== 1 || optimistic) return;
                const other: string | undefined = channel.recipients?.[0];
                if (!other || message.author?.bot) return;
                const today = dayOf(Date.now());
                const before = streaks.users?.[other];
                const s: Streak = before?.day === today ? { ...before } : { ...(before ?? { count: 0 }), day: today, mine: false, theirs: false };
                if (message.author?.id === currentUserId()) s.mine = true;
                else s.theirs = true;
                if (s.mine && s.theirs && s.last !== today) {
                    s.count = s.last === dayOf(Date.now() - 86_400_000) ? s.count + 1 : 1;
                    s.last = today;
                }
                // Most messages of a day change nothing, and aren't worth a write
                if (before && JSON.stringify(before) === JSON.stringify(s)) return;
                streaks.users = { ...(streaks.users ?? {}), [other]: s };
            }),
            onMessageRow("streaks", (row, message) => {
                const channel = getChannel(message.channel_id);
                if (channel?.type !== 1 || message.author?.id === currentUserId() || typeof row.timestamp !== "string") return;
                const count = current(streaks.users?.[message.author?.id]);
                if (count >= store.minimum && !row.timestamp.startsWith("🔥")) row.timestamp = `🔥${count} ${row.timestamp}`;
            }),
        );
    },
});
