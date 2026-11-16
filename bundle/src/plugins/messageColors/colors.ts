/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The color codes Endcord PC's MessageColors finds in messages (#rgb, #rrggbb, rgb(), rgba() and hsl()), and the
 * colored square emoji closest to each. Written without patterns that could take long on someone's long message:
 * what's between the brackets is at most 40 characters, read by splitting it.
 */

export type Rgb = [number, number, number];
export type BlockSide = "right" | "left" | "both";

export interface FoundColor {
    text: string;
    index: number;
    rgb: Rgb;
}

/** The longest text looked at in one piece of a message */
const MAX_TEXT = 4000;

const clamp = (n: number, max: number) => Math.min(max, Math.max(0, n));

export function hslToRgb(h: number, s: number, l: number): Rgb {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 100) / 100;
    l = clamp(l, 100) / 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function parseHex(hex: string): Rgb {
    const full = hex.length === 3 ? [...hex].map(c => c + c).join("") : hex;
    const value = parseInt(full, 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** What's between the brackets of rgb(), rgba() or hsl(), as PC's patterns accept it */
function parseFunction(name: string, inside: string): Rgb | undefined {
    const parts = inside.trim().split(/[\s,/]+/).filter(Boolean);
    const int = (part: string) => /^\d{1,3}$/.test(part) ? Number(part) : NaN;
    if (name === "rgb" || name === "rgba") {
        if (parts.length !== (name === "rgb" ? 3 : 4)) return undefined;
        if (name === "rgba" && !/^[+-]?(?:\d*\.)?\d+%?$/.test(parts[3])) return undefined;
        const rgb = parts.slice(0, 3).map(int);
        return rgb.every(Number.isFinite) ? rgb.map(n => clamp(n, 255)) as Rgb : undefined;
    }
    if (parts.length !== 3) return undefined;
    const hue = /^(\d{1,3})(?:°|deg)?$/.exec(parts[0]);
    const [s, l] = parts.slice(1).map(p => /^\d{1,3}%?$/.test(p) ? Number(p.replace("%", "")) : NaN);
    return hue && Number.isFinite(s) && Number.isFinite(l) ? hslToRgb(Number(hue[1]), s, l) : undefined;
}

/** The color codes in a piece of text, in order */
export function findColors(text: string, shortHex: boolean): FoundColor[] {
    if (!text || !/[#(]/.test(text)) return [];
    const hex = shortHex ? "[0-9a-fA-F]{6}|[0-9a-fA-F]{3}" : "[0-9a-fA-F]{6}";
    // A hex code that runs on ("#1234", "#ff00ff99") isn't one
    const re = new RegExp(`#(${hex})(?![0-9a-zA-Z_])|\\b(rgba?|hsl)\\(([^()\\n]{1,40})\\)`, "gi");
    const found: FoundColor[] = [];
    for (const m of text.slice(0, MAX_TEXT).matchAll(re)) {
        const rgb = m[1] ? parseHex(m[1]) : parseFunction(m[2].toLowerCase(), m[3]);
        if (rgb) found.push({ text: m[0], index: m.index!, rgb });
    }
    return found;
}

/** The colored square emoji closest to a color, by its hue and how light it is */
export function nearestSquare([r, g, b]: Rgb): string {
    const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2, d = max - min;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    if (l <= 0.12) return "⬛";
    if (l >= 0.92) return "⬜";
    if (s < 0.15) return l < 0.5 ? "⬛" : "⬜";
    const hue = max === r / 255 ? 60 * (((g - b) / 255 / d) % 6) : max === g / 255 ? 60 * ((b - r) / 255 / d + 2) : 60 * ((r - g) / 255 / d + 4);
    const h = (hue + 360) % 360;
    if (h >= 330 || h < 15) return "🟥";
    if (h < 45) return l < 0.4 ? "🟫" : "🟧";
    if (h < 70) return "🟨";
    if (h < 165) return "🟩";
    if (h < 255) return "🟦";
    return "🟪";
}

/** The text with a square beside each color code in it, on the side chosen */
export function withSquares(text: string, shortHex: boolean, side: BlockSide): string {
    const colors = findColors(text, shortHex);
    if (!colors.length) return text;
    let out = "", at = 0;
    for (const color of colors) {
        const square = nearestSquare(color.rgb);
        out += text.slice(at, color.index);
        out += side === "left" ? `${square} ${color.text}` : side === "both" ? `${square} ${color.text} ${square}` : `${color.text} ${square}`;
        at = color.index + color.text.length;
    }
    return out + text.slice(at);
}

/** Nodes whose text isn't the message's own words: links, mentions and channels keep theirs */
const isLinkOrMention = (node: any) => node.target != null || node.url != null || node.userId != null || node.channelId != null || node.roleId != null
    || /link|mention|channel|url/i.test(String(node.type ?? ""));

/** Changes the plain text of a row's content nodes, wherever it is in them */
export function mapText(nodes: any[], fn: (text: string) => string): any[] {
    let changed = false;
    const out = nodes.map(node => {
        if (!node || typeof node !== "object") return node;
        if (node.type === "text" && typeof node.content === "string") {
            const content = fn(node.content);
            if (content === node.content) return node;
            changed = true;
            return { ...node, content };
        }
        if (Array.isArray(node.content) && !isLinkOrMention(node)) {
            const content = mapText(node.content, fn);
            if (content === node.content) return node;
            changed = true;
            return { ...node, content };
        }
        return node;
    });
    return changed ? out : nodes;
}
