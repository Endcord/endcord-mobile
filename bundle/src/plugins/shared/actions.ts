/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's message context menu items, as rows in the sheet that opens when you long-press a message.
 *
 * What more than one of these plugins uses.
 */

import { t } from "@core/i18n";

import { currentUserId } from "../common";
import { choose } from "../ui/dialogs";

export const isMine = (message: any) => message.author?.id === currentUserId();

interface Media {
    url: string;
    label: string;
    image: boolean;
}

/** Every attachment and embed picture, video and file in a message */
export function mediaOf(message: any): Media[] {
    const media: Media[] = [];
    for (const a of message.attachments ?? []) {
        const image = /^image\//.test(a.content_type ?? "") || /\.(png|jpe?g|gif|webp|avif)$/i.test(a.filename ?? "");
        media.push({ url: a.url ?? a.proxy_url, label: a.filename ?? t("Attachment"), image });
    }
    for (const e of message.embeds ?? []) {
        const picture = e.image?.url ?? e.thumbnail?.url;
        if (e.video?.url) media.push({ url: e.video.url, label: e.title ?? e.rawTitle ?? t("Video"), image: false });
        if (picture) media.push({ url: picture, label: e.title ?? e.rawTitle ?? t("Image"), image: true });
    }
    return media.filter(m => m.url);
}

/** One of several things, from a sheet, or the only one right away */
export function pickOne<T>(title: string, items: T[], label: (item: T) => string, then: (item: T) => void) {
    if (items.length === 1) then(items[0]);
    else choose(title, items.map(item => ({ label: label(item), value: item })), then);
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decodes base64 to text, or undefined when it isn't valid base64 of valid UTF-8 */
export function decodeBase64(input: string): string | undefined {
    const clean = input.replace(/=+$/, "");
    if (!clean || /[^A-Za-z0-9+/]/.test(clean) || clean.length % 4 === 1) return;
    const bytes: number[] = [];
    let buffer = 0, bits = 0;
    for (const c of clean) {
        buffer = buffer << 6 | B64.indexOf(c);
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes.push(buffer >> bits & 0xFF);
        }
    }
    let out = "";
    for (let i = 0; i < bytes.length;) {
        const b = bytes[i];
        const extra = b < 0x80 ? 0 : b >> 5 === 6 ? 1 : b >> 4 === 14 ? 2 : b >> 3 === 30 ? 3 : -1;
        if (extra < 0 || i + extra >= bytes.length + (extra ? 0 : 1)) return;
        let code = extra ? b & (0x3F >> extra) : b;
        for (let j = 1; j <= extra; j++) {
            const next = bytes[i + j];
            if (next >> 6 !== 2) return;
            code = code << 6 | next & 0x3F;
        }
        // Control characters mean this wasn't text
        if (code < 0x20 && code !== 9 && code !== 10 && code !== 13) return;
        out += String.fromCodePoint(code);
        i += extra + 1;
    }
    return out;
}

// UnitConverter: what each unit is in its counterpart system
// Speeds first, so "km/h" isn't read as "km"
const UNITS: Array<{ re: RegExp; convert: (n: number) => string; }> = [
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:km\/h|kph)\b/gi, convert: n => `${round(n * 0.621371)} mph` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*mph\b/gi, convert: n => `${round(n * 1.609344)} km/h` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:km|kilometers?|kilometres?)\b/gi, convert: n => `${round(n * 0.621371)} mi` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:mi|miles?)\b/gi, convert: n => `${round(n * 1.609344)} km` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:cm|centimeters?|centimetres?)\b/gi, convert: n => `${round(n / 2.54)} in` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:in|inch(?:es)?|")(?=\s|$|[.,!?])/gi, convert: n => `${round(n * 2.54)} cm` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:m|meters?|metres?)\b/gi, convert: n => `${round(n * 3.28084)} ft` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:ft|feet|foot|')(?=\s|$|[.,!?])/gi, convert: n => `${round(n * 0.3048)} m` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:kg|kilograms?|kilos?)\b/gi, convert: n => `${round(n * 2.20462)} lb` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:lbs?|pounds?)\b/gi, convert: n => `${round(n * 0.453592)} kg` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:g|grams?)\b/gi, convert: n => `${round(n / 28.3495)} oz` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:oz|ounces?)\b/gi, convert: n => `${round(n * 28.3495)} g` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:°\s*C|celsius)\b/gi, convert: n => `${round(n * 9 / 5 + 32)} °F` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:°\s*F|fahrenheit)\b/gi, convert: n => `${round((n - 32) * 5 / 9)} °C` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:l|liters?|litres?)\b/gi, convert: n => `${round(n * 0.264172)} gal` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:gal|gallons?)\b/gi, convert: n => `${round(n * 3.78541)} L` },
];

const round = (n: number) => Math.round(n * 100) / 100;

export function convertUnits(text: string): string[] {
    const found: Array<{ index: number; line: string; }> = [];
    const taken: Array<[number, number]> = [];
    for (const { re, convert } of UNITS) {
        for (const match of text.matchAll(re)) {
            const start = match.index ?? 0, end = start + match[0].length;
            // km/h is not also km, and "5 km" is not also "5 m"
            if (taken.some(([s, e]) => start < e && end > s)) continue;
            taken.push([start, end]);
            found.push({ index: start, line: `${match[0].trim()} ≈ ${convert(Number(match[1].replace(",", ".")))}` });
        }
    }
    return found.sort((a, b) => a.index - b.index).map(f => f.line);
}
