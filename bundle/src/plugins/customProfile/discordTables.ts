/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Discord's own tables of what a profile can show: display name fonts and effects, and nameplate colors. The editor
 * offers what's in them, and a shared profile is only handed to Discord's drawing code with values they have: a value
 * Discord has no entry for could stop it drawing a name or the member list, for everyone who sees that profile.
 */

import { findByProps } from "@metro";

export interface NameStyleOption {
    id: number;
    /** "Cherry Bomb", from Discord's "CHERRY_BOMB" */
    name: string;
}

/** The nameplate colors Discord had when this was written, for while its own table can't be found */
export const KNOWN_PALETTES: ReadonlySet<string> = new Set(["crimson", "berry", "sky", "teal", "forest", "bubble_gum", "violet", "cobalt", "clover", "lemon", "white", "black"]);

/**
 * An enum of Discord's: newer builds keep these as DisplayNameFont and DisplayNameEffect of one module, older ones as
 * modules of their own (found by their members)
 */
function enumOf(named: string, ...members: string[]): unknown {
    try {
        return findByProps(named)?.[named] ?? findByProps(...members);
    } catch {
        return undefined;
    }
}

/**
 * A TypeScript enum's names and numbers. It also maps the numbers back to the names, and holds TEST_ entries and an
 * UNSPECIFIED of Discord's own, none of which are a style anyone picks
 */
function options(values: unknown): NameStyleOption[] {
    if (!values || typeof values !== "object") return [];
    return Object.entries(values)
        .filter((entry): entry is [string, number] => Number.isInteger(entry[1]) && Number.isNaN(Number(entry[0]))
            && !entry[0].startsWith("TEST") && entry[0] !== "UNSPECIFIED")
        .map(([key, id]) => ({ id, name: key.toLowerCase().split("_").filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(" ") }));
}

export const nameFonts = () => options(enumOf("DisplayNameFont", "CHICLE", "DEFAULT"));
export const nameEffects = () => options(enumOf("DisplayNameEffect", "SOLID", "GRADIENT", "NEON", "GUMMY"));

/** Discord's nameplate color names, from its own table, or null while that can't be found */
export function nameplatePalettes(): Set<string> | null {
    try {
        const table = findByProps("NAMEPLATE_PALETTES")?.NAMEPLATE_PALETTES;
        if (table && typeof table === "object") {
            const names = Object.keys(table).filter(name => /^[a-z_]{1,40}$/.test(name));
            if (names.length) return new Set(names);
        }
    } catch { }
    return null;
}
