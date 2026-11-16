/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * ReactionTimestamps' pure part: when each reaction came in, as Endcord PC remembers it, the newest few thousand.
 * Nothing here touches Discord.
 */

export interface ReactionEmoji {
    id?: string | null;
    name?: string | null;
    animated?: boolean;
}

export interface ReactionTime {
    userId: string;
    emoji: ReactionEmoji;
    at: number;
}

export const MAX_TIMES = 2000;

const isId = (value: unknown): value is string => typeof value === "string" && /^\d{1,20}$/.test(value);

/** A reaction's emoji as a key: its name and its ID for a custom one */
export const emojiKey = (emoji: ReactionEmoji) => `${String(emoji?.name ?? "").slice(0, 64)}:${isId(emoji?.id) ? emoji.id : ""}`;

/** How a reaction's emoji is written in a list: itself, or :name: for a custom one */
export const emojiLabel = (emoji: ReactionEmoji) => {
    const name = String(emoji?.name ?? "?").slice(0, 64);
    return isId(emoji?.id) ? `:${name}:` : name;
};

export class ReactionTimes {
    private readonly times = new Map<string, ReactionTime>();
    constructor(private readonly max = MAX_TIMES) { }

    private static key(channelId: string, messageId: string, userId: string, emoji: ReactionEmoji) {
        return `${channelId}:${messageId}:${userId}:${emojiKey(emoji)}`;
    }

    /** A reaction that just came in; anything that isn't one is ignored */
    remember(channelId: unknown, messageId: unknown, userId: unknown, emoji: unknown, at = Date.now()) {
        if (!isId(channelId) || !isId(messageId) || !isId(userId) || !emoji || typeof emoji !== "object") return;
        const e = emoji as ReactionEmoji;
        const key = ReactionTimes.key(channelId, messageId, userId, e);
        this.times.delete(key);
        this.times.set(key, { userId, emoji: { id: isId(e.id) ? e.id : null, name: String(e.name ?? "").slice(0, 64), animated: !!e.animated }, at });
        while (this.times.size > this.max) this.times.delete(this.times.keys().next().value!);
    }

    forget(channelId: unknown, messageId: unknown, userId: unknown, emoji: unknown) {
        if (!isId(channelId) || !isId(messageId) || !isId(userId) || !emoji || typeof emoji !== "object") return;
        this.times.delete(ReactionTimes.key(channelId, messageId, userId, emoji as ReactionEmoji));
    }

    /** Every reaction a message got, or one emoji's, when they were all removed */
    forgetAll(channelId: unknown, messageId: unknown, emoji?: ReactionEmoji) {
        if (!isId(channelId) || !isId(messageId)) return;
        const prefix = `${channelId}:${messageId}:`;
        const suffix = emoji ? `:${emojiKey(emoji)}` : undefined;
        for (const key of [...this.times.keys()]) {
            if (key.startsWith(prefix) && (!suffix || key.endsWith(suffix))) this.times.delete(key);
        }
    }

    /** A message's remembered reactions, oldest first */
    of(channelId: string, messageId: string): ReactionTime[] {
        const prefix = `${channelId}:${messageId}:`;
        const found: ReactionTime[] = [];
        for (const [key, time] of this.times) if (key.startsWith(prefix)) found.push(time);
        return found.sort((a, b) => a.at - b.at);
    }

    has(channelId: string, messageId: string) {
        const prefix = `${channelId}:${messageId}:`;
        for (const key of this.times.keys()) if (key.startsWith(prefix)) return true;
        return false;
    }

    get size() {
        return this.times.size;
    }

    clear() {
        this.times.clear();
    }
}

/** The list shown for a message: each reaction, who added it and when */
export function describeTimes(times: ReactionTime[], nameOf: (userId: string) => string, format: (at: number) => string): string {
    return times.map(time => `${emojiLabel(time.emoji)}  ${nameOf(time.userId)} · ${format(time.at)}`).join("\n");
}
