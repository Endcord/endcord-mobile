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

// UnitConverter: what each unit is in its counterpart system, as the text right after a number (sticky: tried only there)
// Speeds first, so "km/h" isn't read as "km"
const UNITS: Array<{ unit: RegExp; convert: (n: number) => string; }> = [
    { unit: /\s*(?:km\/h|kph)\b/iy, convert: n => `${round(n * 0.621371)} mph` },
    { unit: /\s*mph\b/iy, convert: n => `${round(n * 1.609344)} km/h` },
    { unit: /\s*(?:km|kilometers?|kilometres?)\b/iy, convert: n => `${round(n * 0.621371)} mi` },
    { unit: /\s*(?:mi|miles?)\b/iy, convert: n => `${round(n * 1.609344)} km` },
    { unit: /\s*(?:cm|centimeters?|centimetres?)\b/iy, convert: n => `${round(n / 2.54)} in` },
    { unit: /\s*(?:in|inch(?:es)?|")(?=\s|$|[.,!?])/iy, convert: n => `${round(n * 2.54)} cm` },
    { unit: /\s*(?:m|meters?|metres?)\b/iy, convert: n => `${round(n * 3.28084)} ft` },
    { unit: /\s*(?:ft|feet|foot|')(?=\s|$|[.,!?])/iy, convert: n => `${round(n * 0.3048)} m` },
    { unit: /\s*(?:kg|kilograms?|kilos?)\b/iy, convert: n => `${round(n * 2.20462)} lb` },
    { unit: /\s*(?:lbs?|pounds?)\b/iy, convert: n => `${round(n * 0.453592)} kg` },
    { unit: /\s*(?:g|grams?)\b/iy, convert: n => `${round(n / 28.3495)} oz` },
    { unit: /\s*(?:oz|ounces?)\b/iy, convert: n => `${round(n * 28.3495)} g` },
    { unit: /\s*(?:°\s*C|celsius)\b/iy, convert: n => `${round(n * 9 / 5 + 32)} °F` },
    { unit: /\s*(?:°\s*F|fahrenheit)\b/iy, convert: n => `${round((n - 32) * 5 / 9)} °C` },
    { unit: /\s*(?:l|liters?|litres?)\b/iy, convert: n => `${round(n * 0.264172)} gal` },
    { unit: /\s*(?:gal|gallons?)\b/iy, convert: n => `${round(n * 3.78541)} L` },
];

const round = (n: number) => Math.round(n * 100) / 100;

const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";

/**
 * Each match of /(-?\d+(?:[.,]\d+)?)<unit>/g in [text], as that regex finds them: leftmost first, a fraction taken when
 * the unit follows it, none overlapping. The regex itself tries every digit of a long number again and again, as long
 * as the number squared; here where each run of digits ends is worked out once, so each try is a step
 */
function* amounts(text: string, unit: RegExp, runEnd: Int32Array) {
    let p = 0;
    while (p < text.length) {
        const digits = text[p] === "-" ? p + 1 : p;
        if (isDigit(text[digits])) {
            const whole = runEnd[digits];
            const ends = text[whole] === "." || text[whole] === "," ? isDigit(text[whole + 1]) ? [runEnd[whole + 1], whole] : [whole] : [whole];
            const end = ends.find(at => {
                unit.lastIndex = at;
                return unit.test(text);
            });
            if (end !== undefined) {
                yield { start: p, numberEnd: end, end: unit.lastIndex };
                p = unit.lastIndex;
                continue;
            }
        }
        p++;
    }
}

/**
 * The amounts with a unit in [text], each converted. Text from other people's messages, read on every long press: it
 * takes as long as the text, never its square
 */
export function convertUnits(text: string): string[] {
    // Where the run of digits at each position ends
    const runEnd = new Int32Array(text.length + 1);
    runEnd[text.length] = text.length;
    for (let i = text.length - 1; i >= 0; i--) runEnd[i] = isDigit(text[i]) ? runEnd[i + 1] : i;

    const found: Array<{ index: number; line: string; }> = [];
    const taken: Array<[number, number]> = [];
    for (const { unit, convert } of UNITS) {
        for (const { start, numberEnd, end } of amounts(text, unit, runEnd)) {
            // km/h is not also km, and "5 km" is not also "5 m"
            if (taken.some(([s, e]) => start < e && end > s)) continue;
            taken.push([start, end]);
            found.push({ index: start, line: `${text.slice(start, end).trim()} ≈ ${convert(Number(text.slice(start, numberEnd).replace(",", ".")))}` });
        }
    }
    return found.sort((a, b) => a.index - b.index).map(f => f.line);
}
