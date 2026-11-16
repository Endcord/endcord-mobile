/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * MessageNotifier's choices, apart from Discord so they can be tested.
 */

// Discord's message types for what people write: plain messages and replies
const WRITTEN = new Set([0, 19]);

const SNOWFLAKE = /^\d{15,21}$/;

/** The user IDs in a comma separated list, as PC's setting takes them; anything that isn't an ID is left out */
export function userIds(list: string): Set<string> {
    return new Set(String(list ?? "").slice(0, 20_000).split(/[\s,]+/).filter(id => SNOWFLAKE.test(id)));
}

/** Whether a message that arrived is one to pop up for: written (not a system message) by someone on the list */
export function shouldNotify(message: any, wanted: Set<string>, me: string | undefined, openChannelId: string | undefined): boolean {
    if (!message || typeof message !== "object") return false;
    const authorId = message.author?.id;
    if (typeof authorId !== "string" || authorId === me || !wanted.has(authorId)) return false;
    if (!WRITTEN.has(Number(message.type ?? 0))) return false;
    return message.channel_id !== openChannelId;
}
