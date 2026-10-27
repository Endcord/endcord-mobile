/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's file and media plugins: viewing documents and archives, keeping favourites, and better YouTube titles.
 *
 * What more than one of the FileViewer, PdfViewer, ZipPreview, FixFileExtensions, FavoriteAnything and GifCollections plugins uses.
 */

import { fromUtf8 } from "../crypto";
import { choose } from "../ui/dialogs";

export const extension = (name?: string) => (name?.split(".").pop() ?? "").toLowerCase();

export function pick<T extends { filename?: string; }>(title: string, items: T[], then: (item: T) => void) {
    if (items.length === 1) then(items[0]);
    else choose(title, items.map(item => ({ label: item.filename ?? "?", value: item })), then);
}

/** Whether bytes are well-formed UTF-8 (plain ASCII included) */
function isUtf8(bytes: Uint8Array) {
    for (let i = 0; i < bytes.length;) {
        const b = bytes[i];
        const extra = b < 0x80 ? 0 : b >> 5 === 6 ? 1 : b >> 4 === 14 ? 2 : b >> 3 === 30 ? 3 : -1;
        if (extra < 0 || i + extra >= bytes.length + (extra ? 0 : 1)) return false;
        for (let j = 1; j <= extra; j++) if (bytes[i + j] >> 6 !== 2) return false;
        i += extra + 1;
    }
    return true;
}

/** The files in a ZIP archive, from its central directory */
export function zipEntries(bytes: Uint8Array): Array<{ name: string; size: number; }> {
    const u16 = (i: number) => bytes[i] | bytes[i + 1] << 8;
    const u32 = (i: number) => (bytes[i] | bytes[i + 1] << 8 | bytes[i + 2] << 16 | bytes[i + 3] << 24) >>> 0;
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
        if (u32(i) === 0x06054b50) {
            end = i;
            break;
        }
    }
    if (end === -1) throw new Error("Not a ZIP file");
    const count = u16(end + 10);
    let offset = u32(end + 16);
    const entries: Array<{ name: string; size: number; }> = [];
    for (let i = 0; i < count && u32(offset) === 0x02014b50; i++) {
        const nameLength = u16(offset + 28), extraLength = u16(offset + 30), commentLength = u16(offset + 32);
        const raw = bytes.subarray(offset + 46, offset + 46 + nameLength);
        // Flag bit 11 marks a UTF-8 name, but many tools write UTF-8 without setting it; anything else is read byte by byte
        const name = u16(offset + 8) & 0x800 || isUtf8(raw) ? fromUtf8(raw) : String.fromCharCode(...raw);
        entries.push({ name, size: u32(offset + 24) });
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}
