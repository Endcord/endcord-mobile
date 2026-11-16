/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's ColorText (colorText/index.ts there): Discord colors the text of an "ansi" code block with these escape
 * codes, the only colored text it shows.
 */

export const COLORS = {
    gray: 30, red: 31, green: 32, yellow: 33, blue: 34, pink: 35, cyan: 36, white: 37
} as const;
export const BACKGROUNDS = {
    navy: 40, orange: 41, slate: 42, teal: 43, gray: 44, indigo: 45, silver: 46, white: 47
} as const;
export const STYLES = { bold: 1, underline: 4 } as const;

const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const ESCAPE = String.fromCharCode(0x1b);

const own = (table: object, key: unknown): key is string => typeof key === "string" && Object.prototype.hasOwnProperty.call(table, key);

export function colorize(text: string, color: string, background?: string, style?: string) {
    const codes: number[] = [own(STYLES, style) ? STYLES[style as keyof typeof STYLES] : 0, own(COLORS, color) ? COLORS[color as keyof typeof COLORS] : COLORS.white];
    if (own(BACKGROUNDS, background)) codes.push(BACKGROUNDS[background as keyof typeof BACKGROUNDS]);

    // Three backticks would end the block early, so they get a zero width space between them
    const safe = text.replace(/`(?=``)/g, `\`${ZERO_WIDTH_SPACE}`);
    const lines = safe.split("\n").map(line => `${ESCAPE}[${codes.join(";")}m${line}${ESCAPE}[0m`);
    return `\`\`\`ansi\n${lines.join("\n")}\n\`\`\``;
}
