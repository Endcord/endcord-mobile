/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * VolumeBooster's bookkeeping, apart from Discord so it can be tested: which people and streams are boosted, and how
 * far a boost may go.
 */

/** The highest volume Discord's own slider sets, in percent */
export const NORMAL_MAX = 200;

/** Boosts kept at most; the oldest go first */
export const MAX_BOOSTS = 100;

/** Discord's two volume contexts: a person's voice, and the sound of their stream */
export type BoostContext = "default" | "stream";

const SNOWFLAKE = /^\d{15,21}$/;

export const boostKey = (userId: string, context: BoostContext) => `${context}:${userId}`;

export function parseBoostKey(key: string): { userId: string; context: BoostContext; } | undefined {
    if (typeof key !== "string") return undefined;
    const colon = key.indexOf(":");
    if (colon < 0) return undefined;
    const context = key.slice(0, colon);
    const userId = key.slice(colon + 1);
    if (context !== "default" && context !== "stream") return undefined;
    if (!SNOWFLAKE.test(userId)) return undefined;
    return { userId, context };
}

/** The multiplier setting, as PC's slider has it: 1 to 5 */
export function clampMultiplier(multiplier: number): number {
    return Number.isFinite(multiplier) ? Math.min(Math.max(multiplier, 1), 5) : 2;
}

/** The loudest a boost can be: Discord's maximum times the multiplier */
export const maxVolume = (multiplier: number) => Math.round(NORMAL_MAX * clampMultiplier(multiplier));

/** A volume someone typed, as a whole percent from 0 to the maximum */
export function clampVolume(volume: number, multiplier: number): number {
    if (!Number.isFinite(volume)) return 100;
    return Math.round(Math.min(Math.max(volume, 0), maxVolume(multiplier)));
}

/** The saved boosts that are still valid, newest last, each no louder than the multiplier allows now */
export function validBoosts(raw: unknown, multiplier: number): Array<[string, number]> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const out: Array<[string, number]> = [];
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!parseBoostKey(key) || typeof value !== "number" || !Number.isFinite(value)) continue;
        const volume = clampVolume(value, multiplier);
        if (volume > NORMAL_MAX) out.push([key, volume]);
    }
    return out.slice(-MAX_BOOSTS);
}

/**
 * What the live connections need: the boosts to give them (all that stand, as Discord may have handed a connection its
 * own volume since), and the boosts given before that no longer stand, whose people get Discord's own volume back. A
 * boost stops standing when it ends, or when a lower multiplier leaves it at a volume Discord's slider reaches.
 * `applied` is what was last given to the connections; people muted for you are left as they are.
 */
export function boostChanges(applied: Iterable<string>, boosts: Array<[string, number]>, isMuted: (key: string) => boolean): { apply: Array<[string, number]>; restore: string[]; } {
    const standing = new Set(boosts.map(([key]) => key));
    return {
        apply: boosts.filter(([key]) => !isMuted(key)),
        restore: [...applied].filter(key => !standing.has(key)),
    };
}

/**
 * Someone's name as a message should show it, in the bot messages the command answers with: markdown, links and
 * mentions in it read as written rather than being drawn, and it stays on one line
 */
export function escapeMarkdown(text: unknown): string {
    return String(text ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/[\\*_~|`>[\]()<#@:-]/g, "\\$&");
}

/** The boosts with one set (or removed, for a volume Discord's own slider can reach), as a new object */
export function withBoost(raw: unknown, key: string, volume: number | undefined, multiplier: number): Record<string, number> {
    const next: Record<string, number> = Object.create(null);
    for (const [k, v] of validBoosts(raw, multiplier)) if (k !== key) next[k] = v;
    if (volume !== undefined && volume > NORMAL_MAX && parseBoostKey(key)) next[key] = volume;
    const keys = Object.keys(next);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_BOOSTS))) delete next[k];
    // A plain object again, so the storage saves it like any other
    return { ...next };
}
