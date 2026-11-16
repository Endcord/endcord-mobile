/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * FavoriteEmojiFirst's pure part: emoji suggestions with your favorites first, cut back to as many as Discord asked
 * for. Nothing here touches Discord.
 */

/** How many suggestions to look through for favorites, Endcord PC looks through all of them */
export const LOOK_THROUGH = 1000;

/** Favorites first, each group in Discord's order */
export function favoritesFirst<T>(emojis: T[], isFavorite: (emoji: T) => boolean): T[] {
    const favorites: T[] = [], others: T[] = [];
    for (const emoji of emojis) {
        let favorite = false;
        try {
            favorite = !!isFavorite(emoji);
        } catch { }
        (favorite ? favorites : others).push(emoji);
    }
    return [...favorites, ...others];
}

/**
 * Discord's emoji search result with favorites first and no more than `count` suggestions, or undefined when the
 * result isn't one of the shapes Discord uses: a list, `{ emojis: list }` or `{ emojis: { unlocked, locked } }`
 */
export function reorderResult(result: any, count: number, isFavorite: (emoji: any) => boolean): any {
    const limit = (list: any[]) => favoritesFirst(list, isFavorite).slice(0, count);
    if (Array.isArray(result)) return limit(result);
    const emojis = result?.emojis;
    if (Array.isArray(emojis)) return { ...result, emojis: limit(emojis) };
    if (emojis && typeof emojis === "object" && Array.isArray(emojis.unlocked)) {
        const unlocked = limit(emojis.unlocked);
        // The ones you can't use fill what's left, so there are never more suggestions than before
        const locked = Array.isArray(emojis.locked) ? { locked: emojis.locked.slice(0, Math.max(0, count - unlocked.length)) } : {};
        return { ...result, emojis: { ...emojis, unlocked, ...locked } };
    }
    return undefined;
}
