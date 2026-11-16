/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The color math for Endcord's own themes: mixing in OKLab, where a step of the same size looks like the same step in
 * any hue, like Endcord PC's Theme Studio re-deriving Discord's color scales from an accent and a background. Written
 * here rather than with the chroma-js Discord ships, so a theme comes out the same in every Discord version.
 */

export interface Lab {
    L: number;
    a: number;
    b: number;
}

const HEX = /^#?([0-9a-f]{6})$/i;

export function hexToRgb(hex: string): [number, number, number] {
    const match = HEX.exec(hex);
    if (!match) throw new Error(`Not a color: ${hex}`);
    const n = parseInt(match[1], 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

const channel = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
export const rgbToHex = ([r, g, b]: [number, number, number]) => `#${channel(r)}${channel(g)}${channel(b)}`;

const toLinear = (c: number) => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const fromLinear = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055);

/** https://bottosson.github.io/posts/oklab/ */
export function toOklab(hex: string): Lab {
    const [r, g, b] = hexToRgb(hex).map(toLinear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return {
        L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    };
}

export function fromOklab({ L, a, b }: Lab): string {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return rgbToHex([
        fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
    ]);
}

/** a and b mixed in OKLab, t of the way from a to b */
export function mix(a: string, b: string, t: number): string {
    const x = toOklab(a), y = toOklab(b);
    return fromOklab({ L: x.L + (y.L - x.L) * t, a: x.a + (y.a - x.a) * t, b: x.b + (y.b - x.b) * t });
}

/** The same color, lighter (or darker, below 0) by this much of OKLab's lightness, its colorfulness scaled by chroma */
export function shift(hex: string, lightness: number, chroma = 1): string {
    const c = toOklab(hex);
    return fromOklab({ L: Math.min(1, Math.max(0, c.L + lightness)), a: c.a * chroma, b: c.b * chroma });
}

/**
 * A color for every step from the first anchor's to the last's, each mixed between the two anchors around it: anchors
 * are [step, color], in order of step
 */
export function ramp(anchors: Array<[number, string]>, steps: number[]): Record<number, string> {
    const out: Record<number, string> = {};
    for (const step of steps) {
        let i = anchors.findIndex(([at]) => at >= step);
        if (i === -1) i = anchors.length - 1;
        if (i === 0 || anchors[i][0] === step) {
            out[step] = anchors[i][1];
            continue;
        }
        const [from, a] = anchors[i - 1], [to, b] = anchors[i];
        out[step] = mix(a, b, (step - from) / (to - from));
    }
    return out;
}

/** The color, darker on a light background or lighter on a dark one in small steps, until it reads on it this well */
export function readable(color: string, background: string, min: number): string {
    const lighten = toOklab(background).L < 0.5;
    let out = color;
    for (let i = 0; i < 50 && contrast(out, background) < min; i++) out = shift(out, lighten ? 0.02 : -0.02);
    return out;
}

/** WCAG's contrast ratio of two colors, from 1 to 21 */
export function contrast(a: string, b: string): number {
    const lum = (hex: string) => {
        const [r, g, bl] = hexToRgb(hex).map(toLinear);
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
}
