/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * CSS's color-mix(in oklab, role N%, text), which Endcord PC's RoleColorEverywhere tints messages with, worked out by
 * hand: the phone's chat takes a finished color.
 */

export type Rgb = [number, number, number];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const toLinear = (c: number) => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toSrgb = (c: number) => Math.round(255 * clamp01(c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));

export function toOklab([r, g, b]: Rgb): Rgb {
    const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    return [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
}

export function fromOklab([L, a, b]: Rgb): Rgb {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [
        toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
    ];
}

/** `percent` of `color` mixed into `base`, in oklab, as CSS's color-mix does */
export function mixColors(color: Rgb, base: Rgb, percent: number): Rgb {
    const p = clamp01(percent / 100);
    const c = toOklab(color), b = toOklab(base);
    return fromOklab([b[0] + (c[0] - b[0]) * p, b[1] + (c[1] - b[1]) * p, b[2] + (c[2] - b[2]) * p]);
}

/** "#rgb" or "#rrggbb", as Discord gives role colors */
export function parseHex(color: unknown): Rgb | undefined {
    if (typeof color !== "string") return undefined;
    const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(color.trim());
    if (!m) return undefined;
    const full = m[1].length === 3 ? [...m[1]].map(c => c + c).join("") : m[1];
    const value = parseInt(full, 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** The color in one of Android's packed ARGB numbers, as the chat takes them */
export function fromPacked(color: unknown): Rgb | undefined {
    if (typeof color !== "number" || !Number.isFinite(color)) return undefined;
    const value = color >>> 0;
    return [(value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

export const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map(n => n.toString(16).padStart(2, "0")).join("")}`;
