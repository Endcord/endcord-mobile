/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * CharacterCounter's numbers, as Endcord PC works them out.
 */

/** The longest message you can send: 4000 characters with Nitro (premium type 2), 2000 otherwise */
export const messageLimit = (premiumType: unknown) => premiumType === 2 ? 4000 : 2000;

export type CounterLevel = "normal" | "yellow" | "orange" | "red";

/** How close to the limit the text is: muted under half, then yellow, orange from 75% and red from 90% */
export function counterLevel(length: number, max: number): CounterLevel {
    const percentage = length / max * 100;
    if (percentage < 50) return "normal";
    if (percentage < 75) return "yellow";
    if (percentage < 90) return "orange";
    return "red";
}

/** The colors Discord uses for idle, streaming-orange and danger, which read on both themes */
export const LEVEL_COLORS: Record<Exclude<CounterLevel, "normal">, string> = { yellow: "#F0B232", orange: "#E8833A", red: "#F23F43" };
