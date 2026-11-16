/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Quoter's picture, laid out as Endcord PC lays it out: 1200 by 600, the author's avatar on the left fading into black,
 * the quote on the right in the largest size that fits, and the author's names under it. PC measures the text on a
 * canvas; a phone has none, so how wide the text is is worked out from each character's usual width, which is close
 * enough to break the lines where they fit.
 */

export const CANVAS = { width: 1200, height: 600, quoteAreaWidth: 520, quoteAreaX: 640, maxContentHeight: 480 } as const;
export const FONT_SIZES = {
    initial: 42, minimum: 18, decrement: 2, lineHeightMultiplier: 1.25, authorMultiplier: 0.6, usernameMultiplier: 0.45,
    authorMinimum: 22, usernameMinimum: 18, watermark: 18,
} as const;
export const SPACING = { authorTop: 60, username: 10, gradientStart: 200, gradientWidth: 400, watermarkPadding: 20 } as const;

/** The most of a message that goes on the card; more wouldn't fit even at the smallest size */
export const MAX_QUOTE = 1000;
export const MAX_WATERMARK = 32;

/** A character's width as a share of the font size, for Android's own fonts */
export function charWidth(c: string): number {
    const code = c.codePointAt(0) ?? 0;
    // East Asian characters and emoji take a full square
    if (code >= 0x1100 && (code <= 0x115F || code >= 0x2E80 && code <= 0xA4CF || code >= 0xAC00 && code <= 0xD7A3
        || code >= 0xF900 && code <= 0xFAFF || code >= 0xFE30 && code <= 0xFE4F || code >= 0xFF00 && code <= 0xFF60
        || code >= 0xFFE0 && code <= 0xFFE6 || code >= 0x1F000)) return 1.1;
    if (c === " " || "iljtfrI.,;:'!|ı".includes(c)) return 0.3;
    if ("mwMW@%".includes(c)) return 0.85;
    if (c >= "A" && c <= "Z") return 0.68;
    return 0.56;
}

export const textWidth = (text: string, fontSize: number) => [...text].reduce((sum, c) => sum + charWidth(c), 0) * fontSize;

/** The quote's lines at a size, as PC breaks them: at spaces, and long words wherever they must; and at line breaks */
export function wrapLines(text: string, fontSize: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
        const words = paragraph.split(" ").filter(Boolean);
        if (!words.length) {
            lines.push("");
            continue;
        }
        let line: string[] = [];
        for (const word of words) {
            if (textWidth(word, fontSize) > maxWidth) {
                if (line.length) lines.push(line.join(" "));
                line = [];
                let chunk = "";
                for (const c of word) {
                    if (chunk && textWidth(chunk + c, fontSize) > maxWidth) {
                        lines.push(chunk);
                        chunk = c;
                    } else chunk += c;
                }
                if (chunk) line = [chunk];
                continue;
            }
            if (line.length && textWidth([...line, word].join(" "), fontSize) > maxWidth) {
                lines.push(line.join(" "));
                line = [word];
            } else line.push(word);
        }
        if (line.length) lines.push(line.join(" "));
    }
    // Empty lines at either end take room for nothing
    while (lines.length > 1 && !lines[0]) lines.shift();
    while (lines.length > 1 && !lines[lines.length - 1]) lines.pop();
    return lines;
}

export interface Layout {
    fontSize: number;
    lineHeight: number;
    authorFontSize: number;
    usernameFontSize: number;
    lines: string[];
    totalHeight: number;
}

const heightOf = (lines: number, lineHeight: number, author: number, username: number) =>
    lines * lineHeight + SPACING.authorTop + author + SPACING.username + username;

/**
 * The largest size the quote fits at, as PC finds it, from 42 down to 18. A quote too long even for the smallest
 * size is cut where the room ends, with "…", where PC would draw it past the card's edge
 */
export function layoutQuote(quote: string): Layout {
    for (let fontSize: number = FONT_SIZES.initial; fontSize >= FONT_SIZES.minimum; fontSize -= FONT_SIZES.decrement) {
        const lines = wrapLines(quote, fontSize, CANVAS.quoteAreaWidth);
        const lineHeight = fontSize * FONT_SIZES.lineHeightMultiplier;
        const authorFontSize = Math.max(FONT_SIZES.authorMinimum, fontSize * FONT_SIZES.authorMultiplier);
        const usernameFontSize = Math.max(FONT_SIZES.usernameMinimum, fontSize * FONT_SIZES.usernameMultiplier);
        const totalHeight = heightOf(lines.length, lineHeight, authorFontSize, usernameFontSize);
        if (totalHeight <= CANVAS.maxContentHeight) return { fontSize, lineHeight, authorFontSize, usernameFontSize, lines, totalHeight };
    }
    const fontSize = FONT_SIZES.minimum;
    const lineHeight = fontSize * FONT_SIZES.lineHeightMultiplier;
    const room = CANVAS.maxContentHeight - heightOf(0, lineHeight, FONT_SIZES.authorMinimum, FONT_SIZES.usernameMinimum);
    const most = Math.max(1, Math.floor(room / lineHeight));
    let lines = wrapLines(quote, fontSize, CANVAS.quoteAreaWidth);
    if (lines.length > most) {
        lines = lines.slice(0, most);
        let last = lines[most - 1];
        while (last && textWidth(`${last}…`, fontSize) > CANVAS.quoteAreaWidth) last = [...last].slice(0, -1).join("");
        lines[most - 1] = `${last}…`;
    }
    return {
        fontSize, lineHeight, authorFontSize: FONT_SIZES.authorMinimum, usernameFontSize: FONT_SIZES.usernameMinimum, lines,
        totalHeight: heightOf(lines.length, lineHeight, FONT_SIZES.authorMinimum, FONT_SIZES.usernameMinimum),
    };
}

/** The message's text as the card shows it: mentions as names, custom emojis by their name, as PC's fixUpQuote does */
export function quoteText(content: string, userName: (id: string) => string | undefined): string {
    let text = String(content ?? "").slice(0, MAX_QUOTE * 2);
    text = text.replace(/<@!?(\d{17,20})>/g, (match, id: string) => {
        const name = userName(id);
        return name ? `@${name}` : match;
    });
    text = text.replace(/<a?:(\w{1,32}):\d{17,20}>/g, ":$1:");
    text = text.replace(/\r\n?/g, "\n").trim();
    return [...text].length > MAX_QUOTE ? `${[...text].slice(0, MAX_QUOTE - 1).join("")}…` : text;
}

/** The picture's file name, as PC names it: the quote's first words and the author */
export function cardFileName(content: string, username: string): string {
    const words = String(content ?? "").split(" ").slice(0, 6).join(" ").slice(0, 10);
    const clean = (s: string) => s.replace(/[^\w .-]/g, "").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
    const name = [clean(words), clean(String(username ?? ""))].filter(Boolean).join(" - ");
    return `${name.slice(0, 60) || "quote"}.png`;
}

/** Whether bytes are a PNG */
export const isPng = (bytes: Uint8Array) => bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
