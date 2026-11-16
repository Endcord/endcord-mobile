/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * DraftList's list, without Discord: which of DraftStore's drafts are worth showing.
 */

export interface Draft {
    channelId: string;
    timestamp: number;
    draft: string;
}

/** The most drafts listed: one for every chat would be thousands on an old account */
export const MAX_DRAFTS = 200;

/**
 * The drafts worth listing, newest first: something other than spaces is written, in a chat that still exists.
 * DraftStore.getRecentlyEditedDrafts gives { channelId, timestamp, draft } for every chat that has one.
 */
export function unsentDrafts(raw: unknown, hasChannel: (id: string) => boolean): Draft[] {
    if (!Array.isArray(raw)) return [];
    const drafts: Draft[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const { channelId, draft, timestamp } = entry as Record<string, unknown>;
        if (typeof channelId !== "string" || typeof draft !== "string" || !draft.trim() || !hasChannel(channelId)) continue;
        drafts.push({ channelId, draft, timestamp: typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : 0 });
    }
    return drafts.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_DRAFTS);
}

/** A draft on one line, at most `max` characters (whole characters, so an emoji isn't cut in half) */
export function draftPreview(text: string, max = 120): string {
    const line = text.slice(0, max * 4).replace(/\s+/g, " ").trim();
    const chars = Array.from(line);
    return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : line;
}
