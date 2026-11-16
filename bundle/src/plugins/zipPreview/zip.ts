/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * ZIP archives for ZipPreview, without Discord: what's in one (its central directory, like Endcord PC's ZIP+), the
 * folders in it, and a file's bytes, inflated a little at a time so an archive that would unpack to far more than it
 * says (a "zip bomb") is stopped at the limit instead of filling the phone's memory. Archives come from other people,
 * so a file is only handed over when its size and CRC-32 are the ones the archive gives for it.
 */

import { fromUtf8, utf8 } from "../crypto";

export interface ZipEntry {
    /** Its path in the archive, like "folder/file.txt"; folders end with "/" */
    name: string;
    size: number;
    compressedSize: number;
    /** The CRC-32 of its bytes, as the archive gives it */
    crc: number;
    /** 0 stored, 8 deflated; anything else isn't opened */
    method: number;
    /** Where its local header is */
    offset: number;
    encrypted: boolean;
}

/** The most entries listed, and the longest name kept */
export const MAX_ENTRIES = 10_000;
const MAX_NAME = 500;

const u16 = (b: Uint8Array, i: number) => b[i] | b[i + 1] << 8;
const u32 = (b: Uint8Array, i: number) => (b[i] | b[i + 1] << 8 | b[i + 2] << 16 | b[i + 3] << 24) >>> 0;

/** Whether bytes are well-formed UTF-8 that decodes to real characters */
function isUtf8(bytes: Uint8Array) {
    for (let i = 0; i < bytes.length;) {
        const b = bytes[i];
        const extra = b < 0x80 ? 0 : b >= 0xC2 && b <= 0xDF ? 1 : b >= 0xE0 && b <= 0xEF ? 2 : b >= 0xF0 && b <= 0xF4 ? 3 : -1;
        if (extra < 0 || i + extra >= bytes.length + (extra ? 0 : 1)) return false;
        for (let j = 1; j <= extra; j++) if (bytes[i + j] >> 6 !== 2) return false;
        if (b === 0xF4 && bytes[i + 1] > 0x8F) return false;
        i += extra + 1;
    }
    return true;
}

/** A name as it's shown: UTF-8 when it is (many tools don't set the flag that says so), else byte by byte */
function decodeName(raw: Uint8Array, utf8Flag: boolean): string {
    let name: string;
    try {
        name = utf8Flag || isUtf8(raw) ? fromUtf8(raw) : String.fromCharCode(...raw);
    } catch {
        name = String.fromCharCode(...raw);
    }
    return Array.from(name.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\\/g, "/")).slice(0, MAX_NAME).join("");
}

/** The files in an archive, from its central directory */
export function readZip(bytes: Uint8Array): ZipEntry[] {
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
        if (u32(bytes, i) === 0x06054b50) {
            end = i;
            break;
        }
    }
    if (end === -1) throw new Error("Not a ZIP file");
    const count = Math.min(u16(bytes, end + 10), MAX_ENTRIES);
    let at = u32(bytes, end + 16);
    const entries: ZipEntry[] = [];
    for (let i = 0; i < count && at + 46 <= bytes.length && u32(bytes, at) === 0x02014b50; i++) {
        const flags = u16(bytes, at + 8);
        const nameLength = u16(bytes, at + 28), extraLength = u16(bytes, at + 30), commentLength = u16(bytes, at + 32);
        if (at + 46 + nameLength > bytes.length) break;
        entries.push({
            name: decodeName(bytes.subarray(at + 46, at + 46 + nameLength), (flags & 0x800) !== 0),
            method: u16(bytes, at + 10),
            compressedSize: u32(bytes, at + 20),
            size: u32(bytes, at + 24),
            crc: u32(bytes, at + 16),
            offset: u32(bytes, at + 42),
            encrypted: (flags & 1) !== 0,
        });
        at += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

export const isFolder = (entry: ZipEntry) => entry.name.endsWith("/");

/** What's directly in a folder of the archive ("" for the top, "a/b/" for a folder): its folders, then its files */
export function listFolder(entries: readonly ZipEntry[], folder: string): { folders: string[]; files: ZipEntry[]; } {
    const folders = new Set<string>();
    const files: ZipEntry[] = [];
    for (const entry of entries) {
        if (!entry.name.startsWith(folder) || entry.name === folder) continue;
        const rest = entry.name.slice(folder.length);
        const slash = rest.indexOf("/");
        if (slash !== -1) folders.add(rest.slice(0, slash + 1));
        else files.push(entry);
    }
    const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
    return { folders: [...folders].sort(byName), files: files.sort((a, b) => byName(a.name, b.name)) };
}

/** The file's name without its folders */
export const baseName = (name: string) => name.replace(/\/+$/, "").split("/").pop() ?? name;

export class EntryError extends Error {
    /** mismatch: the file's bytes aren't the size or the CRC-32 the archive gives for them */
    constructor(public reason: "encrypted" | "method" | "too-big" | "damaged" | "mismatch") {
        super(reason);
    }
}

/** How much of a deflated file is inflated at once: each piece can grow at most about a thousandfold */
const PIECE = 4096;

/** The bytes, when they're what the archive says the file is */
function checked(data: Uint8Array, entry: ZipEntry): Uint8Array {
    if (data.length !== entry.size || crc32(data) !== entry.crc) throw new EntryError("mismatch");
    return data;
}

/**
 * A file's bytes, at most `max` of them, and only when they're the size and CRC-32 the archive gives for them.
 * `Inflate` is fflate's streaming inflater (Discord ships fflate), which hands over what it unpacked after each piece.
 */
export function readEntry(bytes: Uint8Array, entry: ZipEntry, max: number, Inflate: new (ondata: (chunk: Uint8Array, final: boolean) => void) => { push(data: Uint8Array, final?: boolean): void; }): Uint8Array {
    if (entry.encrypted) throw new EntryError("encrypted");
    if (entry.method !== 0 && entry.method !== 8) throw new EntryError("method");
    if (entry.size > max || entry.size === 0xFFFFFFFF || entry.compressedSize === 0xFFFFFFFF) throw new EntryError("too-big");
    // Stored as it is, a file takes as much room in the archive as it weighs: one that takes more would get past `max`
    if (entry.method === 0 && entry.compressedSize !== entry.size) throw new EntryError("mismatch");
    const at = entry.offset;
    if (at + 30 > bytes.length || u32(bytes, at) !== 0x04034b50) throw new EntryError("damaged");
    const start = at + 30 + u16(bytes, at + 26) + u16(bytes, at + 28);
    const data = bytes.subarray(start, start + entry.compressedSize);
    if (data.length !== entry.compressedSize) throw new EntryError("damaged");
    if (entry.method === 0) return checked(data.slice(), entry);

    const chunks: Uint8Array[] = [];
    let total = 0;
    const inflater = new Inflate(chunk => {
        total += chunk.length;
        if (total > max) throw new EntryError("too-big");
        chunks.push(chunk.slice());
    });
    try {
        for (let i = 0; i < data.length; i += PIECE) inflater.push(data.subarray(i, i + PIECE), i + PIECE >= data.length);
        if (!data.length) inflater.push(new Uint8Array(0), true);
    } catch (e) {
        throw e instanceof EntryError ? e : new EntryError("damaged");
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const chunk of chunks) {
        out.set(chunk, o);
        o += chunk.length;
    }
    return checked(out, entry);
}

const TEXT = new Set(["txt", "md", "json", "js", "ts", "tsx", "jsx", "css", "html", "htm", "xml", "yml", "yaml", "toml", "ini", "cfg", "conf", "log", "csv", "py", "java", "kt", "c", "h", "cpp", "hpp", "cs", "go", "rs", "rb", "php", "sh", "bat", "ps1", "lua", "sql", "gradle", "properties", "gitignore", "env", "svg", "srt", "vtt", "nfo"]);

/** Whether a file in the archive reads as text */
export function isText(name: string): boolean {
    const base = baseName(name).toLowerCase();
    if (["readme", "license", "makefile", "dockerfile", "changelog"].includes(base)) return true;
    const dot = base.lastIndexOf(".");
    return dot !== -1 && TEXT.has(base.slice(dot + 1));
}

// ---------------------------------------------------------------------------------------------------------------------
// Making ZIP files
// ---------------------------------------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ c >>> 1 : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

/** Carries a CRC-32 on over more bytes: start with crc32(first), then crc32(next, previous) */
export function crc32(bytes: Uint8Array, previous = 0): number {
    let crc = ~previous >>> 0;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ crc >>> 8;
    return ~crc >>> 0;
}

export interface ZipInput {
    name: string;
    /** The file's own bytes */
    size: number;
    crc: number;
    /** What goes in the archive: the bytes as they are (method 0), or raw DEFLATE (method 8) */
    data: Uint8Array;
    method: 0 | 8;
}

/** Files that are compressed already, which are stored as they are rather than deflated for nothing */
export const COMPRESSED = new Set(["zip", "7z", "rar", "gz", "xz", "bz2", "zst", "jpg", "jpeg", "png", "gif", "webp", "heic", "avif", "mp4", "mov", "mkv", "webm", "mp3", "ogg", "opus", "m4a", "aac", "flac", "apk", "aab", "jar", "docx", "xlsx", "pptx", "pdf"]);

function dosTime(date: Date) {
    const time = date.getHours() << 11 | date.getMinutes() << 5 | Math.floor(date.getSeconds() / 2);
    const day = Math.max(0, date.getFullYear() - 1980) << 9 | date.getMonth() + 1 << 5 | date.getDate();
    return { time, day };
}

/** Names in an archive must differ: "a.txt", then "a (2).txt" */
export function uniqueNames(names: readonly string[]): string[] {
    const taken = new Set<string>();
    return names.map(name => {
        let candidate = name;
        for (let n = 2; taken.has(candidate.toLowerCase()); n++) {
            const dot = name.lastIndexOf(".");
            candidate = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
        }
        taken.add(candidate.toLowerCase());
        return candidate;
    });
}

/** A ZIP archive of the files, with UTF-8 names */
export function writeZip(files: readonly ZipInput[], date = new Date()): Uint8Array {
    const { time, day } = dosTime(date);
    const names = files.map(file => utf8(file.name));
    const localSize = files.reduce((sum, file, i) => sum + 30 + names[i].length + file.data.length, 0);
    const centralSize = files.reduce((sum, _, i) => sum + 46 + names[i].length, 0);
    const out = new Uint8Array(localSize + centralSize + 22);
    const view = new DataView(out.buffer);
    let at = 0;
    const offsets: number[] = [];
    files.forEach((file, i) => {
        offsets.push(at);
        view.setUint32(at, 0x04034b50, true);
        view.setUint16(at + 4, 20, true);
        view.setUint16(at + 6, 0x800, true);
        view.setUint16(at + 8, file.method, true);
        view.setUint16(at + 10, time, true);
        view.setUint16(at + 12, day, true);
        view.setUint32(at + 14, file.crc, true);
        view.setUint32(at + 18, file.data.length, true);
        view.setUint32(at + 22, file.size, true);
        view.setUint16(at + 26, names[i].length, true);
        view.setUint16(at + 28, 0, true);
        out.set(names[i], at + 30);
        out.set(file.data, at + 30 + names[i].length);
        at += 30 + names[i].length + file.data.length;
    });
    const central = at;
    files.forEach((file, i) => {
        view.setUint32(at, 0x02014b50, true);
        view.setUint16(at + 4, 20, true);
        view.setUint16(at + 6, 20, true);
        view.setUint16(at + 8, 0x800, true);
        view.setUint16(at + 10, file.method, true);
        view.setUint16(at + 12, time, true);
        view.setUint16(at + 14, day, true);
        view.setUint32(at + 16, file.crc, true);
        view.setUint32(at + 20, file.data.length, true);
        view.setUint32(at + 24, file.size, true);
        view.setUint16(at + 28, names[i].length, true);
        view.setUint32(at + 42, offsets[i], true);
        out.set(names[i], at + 46);
        at += 46 + names[i].length;
    });
    view.setUint32(at, 0x06054b50, true);
    view.setUint16(at + 8, files.length, true);
    view.setUint16(at + 10, files.length, true);
    view.setUint32(at + 12, at - central, true);
    view.setUint32(at + 16, central, true);
    return out;
}
