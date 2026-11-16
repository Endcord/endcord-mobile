/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * StickerPaste's waiting stickers, without Discord: a few per chat, sent with the next message.
 */

/** Discord sends at most 3 stickers with a message */
export const MAX_STICKERS = 3;

/** The stickers waiting in a chat after picking more; `full` when some didn't fit */
export function addStickers(waiting: readonly string[], picked: unknown): { stickers: string[]; full: boolean; } {
    const stickers = [...waiting];
    let full = false;
    for (const id of Array.isArray(picked) ? picked : []) {
        if (typeof id !== "string" || !/^\d{1,20}$/.test(id) || stickers.includes(id)) continue;
        if (stickers.length >= MAX_STICKERS) {
            full = true;
            continue;
        }
        stickers.push(id);
    }
    return { stickers, full };
}

/** Whether a send carries text of its own, so the stickers picked with it are sent with it as Discord would */
export const hasText = (content: unknown) => typeof content === "string" && content.trim().length > 0;
