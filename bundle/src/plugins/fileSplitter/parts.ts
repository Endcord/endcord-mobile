/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * FileSplitter's parts, without Discord: their sizes and names (Endcord PC's "file.ext.part1"), finding a file's parts
 * among a chat's messages, and putting their bytes back together as base64.
 */

/** The biggest file split or joined: the file is held in the phone's memory while it's cut or put together */
export const MAX_FILE_BYTES = 40 * 1024 * 1024;
/** The most parts a file is cut into */
export const MAX_PARTS = 100;

/** The most a file can weigh on Discord without Nitro, with Nitro Basic, and with Nitro */
export function uploadLimit(premiumType: unknown): number {
    if (premiumType === 2) return 500 * 1024 * 1024;
    if (premiumType === 1 || premiumType === 3) return 50 * 1024 * 1024;
    return 10 * 1024 * 1024;
}

/**
 * A part's size: the chosen megabytes, never more than you can upload, and a multiple of 3 bytes so the parts' base64
 * joins without being decoded
 */
export function partBytes(megabytes: number, limit: number): number {
    const wanted = Math.min(Math.max(1, Math.round(megabytes)), 100) * 1024 * 1024;
    return Math.floor(Math.min(wanted, limit) / 3) * 3;
}

export const partName = (name: string, index: number) => `${name}.part${index}`;

/** "clip.mp4.part2" as { base: "clip.mp4", index: 2 } */
export function partOf(filename: unknown): { base: string; index: number; } | undefined {
    if (typeof filename !== "string" || filename.length > 300) return undefined;
    const match = /^(.+)\.part(\d{1,3})$/i.exec(filename);
    if (!match) return undefined;
    const index = Number(match[2]);
    return index >= 1 && index <= MAX_PARTS ? { base: match[1], index } : undefined;
}

/** The text of a part's message: the same in every language, so anyone's Endcord can read how many parts there are */
export const partLabel = (name: string, index: number, total: number) => `📦 ${name} [${index}/${total}]`;

/** How many parts a part's message says there are, from partLabel */
export function totalFromContent(content: unknown): number | undefined {
    if (typeof content !== "string") return undefined;
    const match = /\[(\d{1,3})\/(\d{1,3})\]/.exec(content.slice(0, 500));
    const total = match ? Number(match[2]) : NaN;
    return total >= 1 && total <= MAX_PARTS ? total : undefined;
}

export interface FoundPart {
    index: number;
    url: string;
    size: number;
}

/** The message a join is asked from */
export interface JoinAnchor {
    /** The long-pressed message: the copies of the parts nearest to it are used */
    messageId: string;
    /** Who sent it: parts anyone else sent are never used, so nobody can slip their own part into the file */
    authorId: string;
}

export interface FoundParts {
    parts: FoundPart[];
    total: number;
    missing: number[];
    /**
     * Whether a part's message said how many parts there are. Endcord PC's parts don't, and then the total is only the
     * highest part loaded, so the last parts may be missing without it showing.
     */
    totalKnown: boolean;
}

/**
 * A file's parts among a chat's messages (oldest first), from the author of the message the join is asked from: the
 * copy of each part nearest to that message, how many there should be (as the nearest of that author's labels says),
 * and which are missing
 */
export function findParts(messages: readonly any[], base: string, anchor: JoinAnchor): FoundParts {
    if (!anchor.authorId) return { parts: [], total: 0, missing: [], totalKnown: false };
    const at = messages.findIndex(message => message?.id === anchor.messageId);
    // Not among them: the newest copies are the nearest
    const center = at === -1 ? messages.length : at;
    const nearest = new Map<number, { part: FoundPart; distance: number; }>();
    let label: { total: number; distance: number; } | undefined;
    messages.forEach((message, i) => {
        if (message?.author?.id !== anchor.authorId) return;
        const distance = Math.abs(i - center);
        let found = false;
        for (const attachment of Array.isArray(message.attachments) ? message.attachments : []) {
            const part = partOf(attachment?.filename);
            if (!part || part.base !== base || typeof attachment.url !== "string") continue;
            found = true;
            const known = nearest.get(part.index);
            if (!known || distance < known.distance) nearest.set(part.index, { part: { index: part.index, url: attachment.url, size: Number(attachment.size) || 0 }, distance });
        }
        if (!found) return;
        const total = totalFromContent(message.content);
        if (total !== undefined && (!label || distance < label.distance)) label = { total, distance };
    });
    const total = label?.total ?? Math.max(0, ...nearest.keys());
    const parts: FoundPart[] = [];
    const missing: number[] = [];
    for (let i = 1; i <= total; i++) {
        const part = nearest.get(i)?.part;
        if (part) parts.push(part);
        else missing.push(i);
    }
    return { parts, total, missing, totalKnown: !!label };
}

/** Only Discord's own file links are downloaded */
export const isDiscordFile = (url: string) => /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\//i.test(url);

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = new Uint8Array(128).fill(255);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

export function base64ToBytes(text: string): Uint8Array {
    let { length } = text;
    while (length > 0 && text[length - 1] === "=") length--;
    const out = new Uint8Array(Math.floor(length * 3 / 4));
    let buffer = 0, bits = 0, o = 0;
    for (let i = 0; i < length; i++) {
        const code = text.charCodeAt(i);
        const value = code < 128 ? LOOKUP[code] : 255;
        if (value === 255) throw new Error("Not base64");
        buffer = buffer << 6 | value;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[o++] = buffer >> bits & 0xFF;
        }
    }
    return out.subarray(0, o);
}

export function bytesToBase64(bytes: Uint8Array): string {
    const chunks: string[] = [];
    let line: number[] = [];
    for (let i = 0; i < bytes.length; i += 3) {
        const n = bytes[i] << 16 | (bytes[i + 1] ?? 0) << 8 | (bytes[i + 2] ?? 0);
        line.push(ALPHABET.charCodeAt(n >> 18 & 63), ALPHABET.charCodeAt(n >> 12 & 63),
            i + 1 < bytes.length ? ALPHABET.charCodeAt(n >> 6 & 63) : 61, i + 2 < bytes.length ? ALPHABET.charCodeAt(n & 63) : 61);
        if (line.length >= 8192) {
            chunks.push(String.fromCharCode(...line));
            line = [];
        }
    }
    chunks.push(String.fromCharCode(...line));
    return chunks.join("");
}

/**
 * Joins files given as base64 into the base64 of them one after the other. Parts whose length is a multiple of 3
 * bytes (FileSplitter's own) are put together as they are; any others (Endcord PC's) are decoded across the seam.
 */
export function joinBase64(parts: readonly string[]): string {
    const out: string[] = [];
    let carry = new Uint8Array(0);
    for (const [i, part] of parts.entries()) {
        const last = i === parts.length - 1;
        if (!carry.length && (last || !part.endsWith("="))) {
            out.push(part);
            continue;
        }
        const bytes = base64ToBytes(part);
        const all = new Uint8Array(carry.length + bytes.length);
        all.set(carry);
        all.set(bytes, carry.length);
        const whole = last ? all.length : all.length - all.length % 3;
        out.push(bytesToBase64(all.subarray(0, whole)));
        carry = all.slice(whole);
    }
    if (carry.length) out.push(bytesToBase64(carry));
    return out.join("");
}
