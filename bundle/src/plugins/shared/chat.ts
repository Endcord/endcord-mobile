/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's chat plugins: long messages, reactions, replies and mentions, an AI helper, and feeling a ping.
 *
 * Helpers of the SplitLargeMessages plugin, which other code uses too.
 */



/** Splits text into pieces of at most `limit` characters, at a line break or space where it can */
export function splitMessage(text: string, limit: number): string[] {
    const parts: string[] = [];
    let rest = text;
    while (rest.length > limit) {
        let cut = rest.lastIndexOf("\n", limit);
        if (cut < limit / 2) cut = rest.lastIndexOf(" ", limit);
        if (cut < limit / 2) cut = limit;
        parts.push(rest.slice(0, cut).trimEnd());
        rest = rest.slice(cut).replace(/^[ \n]/, "");
    }
    if (rest.trim()) parts.push(rest);
    return parts;
}
