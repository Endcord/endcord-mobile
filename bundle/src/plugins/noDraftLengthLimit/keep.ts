/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * NoDraftLengthLimit's bookkeeping, without Discord: the whole text of long drafts, and when to give it back instead
 * of the start DraftStore cut it down to.
 */

/**
 * Drafts longer than this are kept whole. Discord cuts saved drafts at 4500 characters; anything that could be cut
 * is kept, so a different limit in this Discord doesn't lose text either.
 */
export const KEEP_FROM = 1900;
/** The longest draft kept, far past anything Discord could send even split into many messages */
export const MAX_KEPT_LENGTH = 200_000;
/** The most long drafts kept at once; the oldest goes first */
export const MAX_KEPT = 50;

export const draftKey = (channelId: string, draftType: unknown) => `${channelId}:${typeof draftType === "number" ? draftType : 0}`;

/**
 * Keeps (or forgets) a draft that was just written, returning the new list. The list is in the order drafts were last
 * written, so the oldest is first.
 */
export function rememberDraft(kept: Record<string, string>, key: string, draft: unknown): Record<string, string> {
    const next = { ...kept };
    delete next[key];
    if (typeof draft === "string" && draft.length > KEEP_FROM) next[key] = draft.slice(0, MAX_KEPT_LENGTH);
    const keys = Object.keys(next);
    for (let i = 0; i < keys.length - MAX_KEPT; i++) delete next[keys[i]];
    return next;
}

/**
 * What a chat's message box should get back: the whole draft when DraftStore's is the start of it (Discord cut it),
 * otherwise DraftStore's own, which is newer than anything kept
 */
export function fullDraft(stored: unknown, kept: string | undefined): unknown {
    if (typeof stored !== "string" || typeof kept !== "string") return stored;
    if (stored.length < KEEP_FROM || kept.length <= stored.length || !kept.startsWith(stored)) return stored;
    return kept;
}
