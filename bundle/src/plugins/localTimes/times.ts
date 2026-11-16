/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Finding times with a time zone in a message, the same as Endcord PC's LocalTimes (localTimes/index.tsx there).
 * Written without lookbehind, which not every JavaScript engine React Native has had reads: the character before a
 * time is checked by hand, which finds the same times in the same order.
 */

// People write "EST" all year when they mean the time in New York, so each name stands for its place, and the
// place's own clock decides whether it's summer time there that day
export const ZONES: Readonly<Record<string, string>> = {
    ET: "America/New_York", EST: "America/New_York", EDT: "America/New_York",
    CT: "America/Chicago", CST: "America/Chicago", CDT: "America/Chicago",
    MT: "America/Denver", MST: "America/Denver", MDT: "America/Denver",
    PT: "America/Los_Angeles", PST: "America/Los_Angeles", PDT: "America/Los_Angeles",
    AKST: "America/Anchorage", AKDT: "America/Anchorage", HST: "Pacific/Honolulu",
    BRT: "America/Sao_Paulo", ART: "America/Argentina/Buenos_Aires",
    BST: "Europe/London", WET: "Europe/Lisbon", WEST: "Europe/Lisbon",
    CET: "Europe/Paris", CEST: "Europe/Paris", EET: "Europe/Athens", EEST: "Europe/Athens",
    TRT: "Europe/Istanbul", MSK: "Europe/Moscow",
    IST: "Asia/Kolkata", PKT: "Asia/Karachi", WIB: "Asia/Jakarta", ICT: "Asia/Bangkok",
    SGT: "Asia/Singapore", HKT: "Asia/Hong_Kong", PHT: "Asia/Manila", JST: "Asia/Tokyo", KST: "Asia/Seoul",
    AWST: "Australia/Perth", ACST: "Australia/Adelaide", ACDT: "Australia/Adelaide",
    AEST: "Australia/Sydney", AEDT: "Australia/Sydney", NZST: "Pacific/Auckland", NZDT: "Pacific/Auckland"
};

/** The longest message looked at: Discord's own limit for Nitro */
export const MAX_CONTENT = 4000;
/** The most times shown under one message, as on PC */
const MAX_TIMES = 3;

// Zone names only count in capitals: "9:00 art class" is not Argentina
const NAMES = `UTC|GMT|${Object.keys(ZONES).sort((a, b) => b.length - a.length).join("|")}`;
// PC's pattern without its (?<![\w:.]) at the start of each form
const TIME_RE = new RegExp(
    String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*([aApP])\.?[mM]\.?(?![a-zA-Z])\s*(${NAMES})(?![a-zA-Z])` +
    String.raw`|(\d{1,2})[:.](\d{2})\s*(${NAMES})(?:\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?)?(?![\w])`,
    "g"
);
// An offset written after the 12 hour form too, like "5pm UTC+3"; read where the time ends, without copying the rest
const OFFSET_AFTER = /\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?(?![\w])/y;
const BEFORE_TIME = /[\w:.]/;

export interface FoundTime {
    /** As it is written in the message */
    text: string;
    /** The moment it means */
    at: number;
}

const zoneFormats = new Map<string, Intl.DateTimeFormat>();

/** The date and time on a zone's clock at a moment, as [year, month, day, hour, minute] */
function wallClock(zone: string, at: number): number[] | undefined {
    let format = zoneFormats.get(zone);
    // hour12 rather than PC's hourCycle, which not every engine React Native has had reads
    if (!format) zoneFormats.set(zone, format = new Intl.DateTimeFormat("en-US", {
        timeZone: zone, hour12: false, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric"
    }));
    let fields: number[] | undefined;
    let period: string | undefined;
    if (typeof format.formatToParts === "function") {
        const parts = format.formatToParts(at);
        const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
        fields = [get("year"), get("month"), get("day"), get("hour"), get("minute")];
        period = parts.find(p => p.type === "dayPeriod")?.value;
    } else {
        // "11/14/2026, 13:05"
        const text = format.format(at);
        const m = /(\d+)\D+(\d+)\D+(\d+)\D+(\d+)\D+(\d+)/.exec(text);
        fields = m ? [Number(m[3]), Number(m[1]), Number(m[2]), Number(m[4]), Number(m[5])] : undefined;
        period = /\b([AP])\.?M\b/i.exec(text)?.[1];
    }
    if (!fields || fields.some(n => !Number.isFinite(n))) return undefined;
    // An engine that still writes a 12 hour clock, and some that write midnight as 24:00 of the same day
    if (period && fields[3] <= 12) fields[3] = fields[3] % 12 + (/^p/i.test(period) ? 12 : 0);
    if (fields[3] === 24) fields[3] = 0;
    return fields;
}

/** Minutes the zone is ahead of UTC at that moment, or NaN when this phone doesn't know the zone */
export function zoneOffset(zone: string, at: number): number {
    let clock: number[] | undefined;
    try {
        clock = wallClock(zone, at);
    } catch {
        // A zone this phone's clock doesn't know
        return NaN;
    }
    if (!clock) return NaN;
    const [year, month, day, hour, minute] = clock;
    return Math.round((Date.UTC(year, month - 1, day, hour, minute) - Math.floor(at / 60000) * 60000) / 60000);
}

/** The moment the time means, on the day the message was sent in that place */
function resolve(hour: number, minute: number, zone: string | null, fixedOffset: number, sentAt: number) {
    const offsetAt = (at: number) => zone ? zoneOffset(zone, at) : fixedOffset;
    const day = new Date(sentAt + offsetAt(sentAt) * 60000);
    const wall = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute);
    // Once more with the offset of that hour itself, for the days the clocks change
    return wall - offsetAt(wall - offsetAt(wall) * 60000) * 60000;
}

/** The times with a zone in a message that aren't already in the reader's own time, at most three */
export function findTimes(content: string, sentAt: number): FoundTime[] {
    if (!content || !/\d/.test(content)) return [];
    // Code and links show times as they are written
    const text = content.slice(0, MAX_CONTENT).replace(/```[\s\S]*?```|`[^`\n]*`|https?:\/\/\S+/g, m => " ".repeat(m.length));
    const found: FoundTime[] = [];

    TIME_RE.lastIndex = 0;
    for (let m = TIME_RE.exec(text); m; m = TIME_RE.exec(text)) {
        // PC's lookbehind: a time can't follow a letter, a digit, a colon or a dot. The search then goes on from the
        // next character, as the engine would have
        if (m.index > 0 && BEFORE_TIME.test(text[m.index - 1])) {
            TIME_RE.lastIndex = m.index + 1;
            continue;
        }

        const twelveHour = m[1] != null;
        let hour = Number(twelveHour ? m[1] : m[5]);
        const minute = Number((twelveHour ? m[2] : m[6]) ?? 0);
        const name = (twelveHour ? m[4] : m[7]).toUpperCase();
        let sign = m[8], offH = m[9], offM = m[10];
        let written = m[0];

        if (twelveHour) {
            OFFSET_AFTER.lastIndex = m.index + m[0].length;
            const after = OFFSET_AFTER.exec(text);
            if (after) {
                [, sign, offH, offM] = after;
                written += after[0];
            }
            if (hour < 1 || hour > 12) continue;
            hour = hour % 12 + (m[3].toLowerCase() === "p" ? 12 : 0);
        } else if (hour > 23) continue;
        if (minute > 59) continue;

        const zone = ZONES[name] ?? null;
        let fixedOffset = 0;
        if (!zone && sign) {
            fixedOffset = (Number(offH) * 60 + Number(offM ?? 0)) * (sign === "-" ? -1 : 1);
            if (Math.abs(fixedOffset) > 14 * 60) continue;
        } else if (zone && sign) continue; // "EST+2" isn't a time anyone means

        let at: number;
        try {
            at = resolve(hour, minute, zone, fixedOffset, sentAt);
        } catch {
            // A zone this phone's clock doesn't know
            continue;
        }
        if (!Number.isFinite(at)) continue;
        // Already the reader's own time: nothing to tell them
        if (new Date(at).getHours() === hour && new Date(at).getMinutes() === minute) continue;
        if (!found.some(f => f.at === at)) found.push({ text: written.trim(), at });
        if (found.length === MAX_TIMES) break;
    }

    return found;
}
