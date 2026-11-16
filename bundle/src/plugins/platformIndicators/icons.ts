/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * PlatformIndicators' icons as Endcord PC draws them (the same shapes, each colored with that platform's status), as a
 * PNG: Discord's chat rows and profile badges show images, not SVG. The shapes are alpha masks made from PC's icons
 * (scripts/platform-icons.mjs); a row of them is colored and written out here, as a palette PNG compressed with deflate,
 * small enough to go in a data: link.
 */

import { MASK_HEIGHT, MASKS } from "./masks";

export type Platform = "desktop" | "web" | "mobile" | "embedded" | "vr";

/** Discord's status colors, as its own status dots draw them */
export const STATUS_COLORS: Readonly<Record<string, string>> = {
    online: "#23a55a",
    idle: "#f0b232",
    dnd: "#f23f43",
    streaming: "#593695",
    offline: "#80848e",
};

/** Space between two icons, in pixels of the masks (2 px at PC's 20 px size) */
const GAP = 5;
/** Levels of alpha in a mask, 0 being none */
const LEVELS = 15;

const decoded = new Map<string, Uint8Array>();

/** A mask's alpha levels, one byte a pixel */
function maskOf(platform: string): { width: number; levels: Uint8Array; } | null {
    const mask = MASKS[platform];
    if (!mask) return null;
    let levels = decoded.get(platform);
    if (!levels) {
        const packed = fromBase64(mask.data);
        levels = new Uint8Array(mask.width * MASK_HEIGHT);
        for (let i = 0; i < levels.length; i++) levels[i] = i & 1 ? packed[i >> 1] & 0xF : packed[i >> 1] >> 4;
        decoded.set(platform, levels);
    }
    return { width: mask.width, levels };
}

export interface IconsImage {
    /** A PNG, as a `data:` link */
    uri: string;
    width: number;
    height: number;
}

/**
 * The icons of [entries], left to right, each in its status's color, as a PNG; null for none. One color per status, so
 * a palette of at most a few dozen entries: one byte a pixel, and long runs of the same byte, which is what deflate
 * shrinks best.
 */
export function iconsImage(entries: ReadonlyArray<{ platform: Platform; status: string; }>): IconsImage | null {
    const icons = entries.flatMap(({ platform, status }) => {
        const mask = maskOf(platform);
        return mask ? [{ mask, color: STATUS_COLORS[status] ?? STATUS_COLORS.offline }] : [];
    });
    if (!icons.length) return null;

    const colors = [...new Set(icons.map(icon => icon.color))];
    const width = icons.reduce((sum, icon) => sum + icon.mask.width, 0) + GAP * (icons.length - 1);
    const height = MASK_HEIGHT;
    const pixels = new Uint8Array(width * height);
    let left = 0;
    for (const { mask, color } of icons) {
        const base = 1 + colors.indexOf(color) * LEVELS;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < mask.width; x++) {
                const level = mask.levels[y * mask.width + x];
                if (level) pixels[y * width + left + x] = base + level - 1;
            }
        }
        left += mask.width + GAP;
    }

    // Index 0 is see-through; then each color at each level of alpha
    const palette = new Uint8Array(3 * (1 + colors.length * LEVELS));
    const alpha = new Uint8Array(1 + colors.length * LEVELS);
    colors.forEach((color, c) => {
        const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
        for (let level = 1; level <= LEVELS; level++) {
            const index = 1 + c * LEVELS + level - 1;
            palette.set(rgb, index * 3);
            alpha[index] = Math.round(level * 255 / LEVELS);
        }
    });
    return { uri: `data:image/png;base64,${toBase64(encodePng(width, height, pixels, palette, alpha))}`, width, height };
}

// ---- PNG ------------------------------------------------------------------------------------------------------------

/** An 8-bit palette PNG of [pixels] (palette indices, row by row) */
export function encodePng(width: number, height: number, pixels: Uint8Array, palette: Uint8Array, alpha: Uint8Array): Uint8Array {
    // Each row starts with its filter type: none
    const raw = new Uint8Array((width + 1) * height);
    for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);

    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    header.set([8, 3, 0, 0, 0], 8);

    return concat([
        new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        chunk("IHDR", header),
        chunk("PLTE", palette),
        chunk("tRNS", alpha),
        chunk("IDAT", zlib(raw)),
        chunk("IEND", new Uint8Array(0)),
    ]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
}

let crcTable: Uint32Array | undefined;

export function crc32(data: Uint8Array): number {
    if (!crcTable) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            crcTable[n] = c >>> 0;
        }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ---- zlib, with deflate's fixed codes and repeats of the byte before (runs of see-through pixels) --------------------

/** Deflate's length codes: [first length, extra bits] for codes 257 to 285 */
const LENGTHS: ReadonlyArray<readonly [number, number]> = [
    [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 1], [13, 1], [15, 1], [17, 1], [19, 2], [23, 2],
    [27, 2], [31, 2], [35, 3], [43, 3], [51, 3], [59, 3], [67, 4], [83, 4], [99, 4], [115, 4], [131, 5], [163, 5], [195, 5],
    [227, 5], [258, 0],
];

class BitWriter {
    private bytes: number[] = [];
    private current = 0;
    private count = 0;

    /** Bits as numbers, least significant first: extra bits and block headers */
    bits(value: number, n: number) {
        for (let i = 0; i < n; i++) this.bit((value >> i) & 1);
    }

    /** A Huffman code, most significant bit first */
    code(value: number, n: number) {
        for (let i = n - 1; i >= 0; i--) this.bit((value >> i) & 1);
    }

    private bit(b: number) {
        this.current |= b << this.count;
        if (++this.count === 8) {
            this.bytes.push(this.current);
            this.current = 0;
            this.count = 0;
        }
    }

    finish(): number[] {
        if (this.count) this.bytes.push(this.current);
        this.current = this.count = 0;
        return this.bytes;
    }
}

/** A literal or length symbol in deflate's fixed code */
function symbol(out: BitWriter, value: number) {
    if (value < 144) out.code(0x30 + value, 8);
    else if (value < 256) out.code(0x190 + value - 144, 9);
    else if (value < 280) out.code(value - 256, 7);
    else out.code(0xC0 + value - 280, 8);
}

/** A repeat of the byte before, [length] (3 to 258) times */
function repeat(out: BitWriter, length: number) {
    let code = LENGTHS.length - 1;
    while (LENGTHS[code][0] > length) code--;
    const [first, extra] = LENGTHS[code];
    symbol(out, 257 + code);
    out.bits(length - first, extra);
    // Distance 1: code 0 of the fixed distance codes, five bits, no extra bits
    out.code(0, 5);
}

export function zlib(data: Uint8Array): Uint8Array {
    const out = new BitWriter();
    // The last block, compressed with the fixed codes
    out.bits(1, 1);
    out.bits(1, 2);
    let i = 0;
    while (i < data.length) {
        if (i > 0) {
            let run = 0;
            while (run < 258 && i + run < data.length && data[i + run] === data[i - 1]) run++;
            if (run >= 3) {
                repeat(out, run);
                i += run;
                continue;
            }
        }
        symbol(out, data[i++]);
    }
    symbol(out, 256);

    let a = 1, b = 0;
    for (let j = 0; j < data.length; j++) {
        a = (a + data[j]) % 65521;
        b = (b + a) % 65521;
    }
    const checksum = ((b << 16) | a) >>> 0;
    return new Uint8Array([0x78, 0x01, ...out.finish(), checksum >>> 24, (checksum >>> 16) & 0xFF, (checksum >>> 8) & 0xFF, checksum & 0xFF]);
}

// ---- Helpers --------------------------------------------------------------------------------------------------------

function concat(parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function toBase64(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
        out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63]
            + (i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : "=")
            + (i + 2 < bytes.length ? ALPHABET[n & 63] : "=");
    }
    return out;
}

export function fromBase64(text: string): Uint8Array {
    const clean = text.replace(/=+$/, "");
    const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
    let buffer = 0, bits = 0, o = 0;
    for (let i = 0; i < clean.length; i++) {
        const value = ALPHABET.indexOf(clean[i]);
        if (value < 0) throw new Error("Not base64");
        buffer = ((buffer << 6) | value) & 0xFFFFFF;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[o++] = (buffer >> bits) & 0xFF;
        }
    }
    return out;
}
