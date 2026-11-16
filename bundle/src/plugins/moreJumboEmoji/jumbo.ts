/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const EMOJI_TYPES = new Set(["emoji", "customEmoji"]);

/**
 * A chat row's content made jumbo the way Discord makes it: when the message is only emojis (and the spaces between
 * them), every part of it is marked jumboable. Discord does that up to its own limit, which is built into its code;
 * this does it up to `limit`. Returns the new content, or undefined when there's nothing to change.
 */
export function jumboContent(content: unknown, limit: number): any[] | undefined {
    if (!Array.isArray(content) || !content.length || content.length > 4000) return undefined;
    let emojis = 0;
    let marked = true;
    for (const node of content) {
        if (!node || typeof node !== "object") return undefined;
        if (EMOJI_TYPES.has(node.type)) emojis++;
        else if (node.type !== "text" || typeof node.content !== "string" || node.content.trim() !== "") return undefined;
        if (node.jumboable !== true) marked = false;
    }
    if (marked || emojis === 0 || emojis > limit) return undefined;
    return content.map(node => ({ ...node, jumboable: true }));
}
