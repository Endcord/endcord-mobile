/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** The most people looked up for one message, one after another */
export const MAX_LOOKUPS = 20;
/** The longest text searched for mentions: Discord's own limit for Nitro */
const MAX_CONTENT = 4000;

/** The people a message mentions that Discord doesn't know, in the order they're written, each once */
export function unknownMentions(content: unknown, known: (id: string) => boolean, max = MAX_LOOKUPS): string[] {
    if (typeof content !== "string" || !content.includes("<@")) return [];
    const ids: string[] = [];
    for (const m of content.slice(0, MAX_CONTENT).matchAll(/<@!?(\d{15,21})>/g)) {
        const id = m[1];
        if (ids.includes(id) || known(id)) continue;
        ids.push(id);
        if (ids.length >= max) break;
    }
    return ids;
}

/** How long Discord asks to wait after too many requests, in milliseconds, within reason */
export function retryDelay(error: any): number {
    const seconds = Number(error?.body?.retry_after ?? error?.retry_after);
    return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 10_000) : 1000;
}
