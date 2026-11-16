/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Decor's data: which decoration each user picked, as decor.fieryflames.dev answers it for a batch of users, and the
 * image of a decoration on its CDN. What the server sends is checked before anything uses it.
 */

export const API_URL = "https://decor.fieryflames.dev/api";
export const CDN_URL = "https://ugc.decor.fieryflames.dev";
/** "decor" in ASCII numbers: the skuId Decor's decorations carry, which no shop item has */
export const SKU_ID = "100101099111114";
/** How long a user's decoration is trusted before it's asked again, as on Endcord PC */
export const FETCH_COOLDOWN = 4 * 60 * 60 * 1000;
/** The most users asked about in one request */
export const BATCH_SIZE = 100;
/** The most users remembered between starts */
export const MAX_REMEMBERED = 3000;

export interface Known {
    /** The decoration, or null for none */
    a: string | null;
    /** When it was asked */
    t: number;
}

const USER_ID = /^\d{17,20}$/;
/** A decoration's hash, "a_" first when it's animated; it ends up in a link */
const ASSET = /^[A-Za-z0-9_-]{1,100}$/;

export const isUserId = (id: unknown): id is string => typeof id === "string" && USER_ID.test(id);

/** The link of the request for a batch of users */
export const usersUrl = (ids: string[]) => `${API_URL}/users?ids=${encodeURIComponent(JSON.stringify(ids))}`;

/** Each asked user's decoration from the server's answer: only those asked, and only decorations that look like one */
export function readAnswer(answer: unknown, asked: string[]): Map<string, string | null> {
    const found = new Map<string, string | null>();
    const record = answer && typeof answer === "object" && !Array.isArray(answer) ? answer as Record<string, unknown> : {};
    for (const id of asked) {
        const value = Object.prototype.hasOwnProperty.call(record, id) ? record[id] : null;
        found.set(id, typeof value === "string" && ASSET.test(value) ? value : null);
    }
    return found;
}

/** The decoration's image; animated ones are drawn still where Discord doesn't animate */
export function decorationUrl(asset: string, canAnimate: boolean): string {
    const name = asset.startsWith("a_") && !canAnimate ? asset.slice(2) : asset;
    return `${CDN_URL}/${name}.png`;
}

export const isFresh = (known: Known | undefined, now: number) => !!known && now - known.t < FETCH_COOLDOWN && known.t <= now;

/** What's kept between starts: the newest, and only well-formed entries */
export function prune(entries: Iterable<[string, Known]>, max = MAX_REMEMBERED): Record<string, Known> {
    const valid = [...entries].filter(([id, k]) => isUserId(id) && k && typeof k.t === "number" && (k.a === null || typeof k.a === "string" && ASSET.test(k.a)));
    valid.sort((a, b) => b[1].t - a[1].t);
    const kept: Record<string, Known> = {};
    for (const [id, k] of valid.slice(0, max)) kept[id] = { a: k.a, t: k.t };
    return kept;
}
