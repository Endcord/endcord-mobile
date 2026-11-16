/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Timed lyrics from lrclib.net, a free and open lyrics library that needs no account, as Endcord PC finds them. What
 * lrclib sends is written by anyone, so it's capped before it's read.
 */

import safeFetch, { readJson } from "@lib/utils/safeFetch";

export interface Song {
    id: string;
    name: string;
    artists: string[];
    album: string;
    /** In milliseconds */
    duration: number;
}

export interface Line {
    /** When the line starts, in milliseconds */
    at: number;
    /** null for a gap: an instrumental part, or the silence between verses */
    text: string | null;
}

interface LrcLibSong {
    trackName?: unknown;
    artistName?: unknown;
    duration?: unknown;
    instrumental?: unknown;
    syncedLyrics?: unknown;
}

const API = "https://lrclib.net/api";

/** Discord cuts custom statuses at 128 characters */
export const MAX_STATUS_LENGTH = 128;
/** The longest lyrics read: a long song's are some 10 000 characters */
const MAX_LRC_LENGTH = 200_000;
/** The most lines kept from one song */
const MAX_LINES = 3000;
/** The most a reply may weigh: a search answers with up to 20 songs' lyrics */
const MAX_REPLY_BYTES = 2 * 1024 * 1024;

const TIME = /\[(\d{1,4}):(\d{1,2}(?:\.\d{1,3})?)\]/g;

/** "[01:02.50]text" lines into timed lines, sorted; a line can carry several times when it repeats */
export function parseLrc(lrc: string): Line[] {
    const lines: Line[] = [];
    for (const raw of lrc.slice(0, MAX_LRC_LENGTH).split("\n")) {
        const times = [...raw.matchAll(TIME)];
        if (!times.length) continue;
        const text = raw.replace(TIME, "").trim().slice(0, MAX_STATUS_LENGTH * 2);
        for (const [, minutes, seconds] of times) {
            lines.push({
                at: Math.round((Number(minutes) * 60 + Number(seconds)) * 1000),
                text: text === "" || text === "♪" ? null : text,
            });
            if (lines.length >= MAX_LINES) break;
        }
        if (lines.length >= MAX_LINES) break;
    }
    return lines.sort((a, b) => a.at - b.at);
}

/** Real timed lyrics: not an instrumental, a one-line test upload or untimed text */
export function usableLines(song: LrcLibSong | null | undefined): Line[] | null {
    if (!song || typeof song.syncedLyrics !== "string" || !song.syncedLyrics || song.instrumental === true) return null;
    const lines = parseLrc(song.syncedLyrics);
    return lines.filter(l => l.text).length >= 4 ? lines : null;
}

/** Of a search's results, the usable lyrics of the one closest in length to the song, within 4 seconds */
export function closestLyrics(results: unknown, seconds: number): Line[] | null {
    if (!Array.isArray(results)) return null;
    const near = results
        .slice(0, 50)
        .filter((r): r is LrcLibSong => !!r && typeof r === "object" && typeof r.duration === "number" && Math.abs(r.duration - seconds) <= 4)
        .sort((a, b) => Math.abs((a.duration as number) - seconds) - Math.abs((b.duration as number) - seconds));
    for (const result of near) {
        const lines = usableLines(result);
        if (lines) return lines;
    }
    return null;
}

/** The line to show at a moment of the song: the last one started, if it has words */
export function lineAt(lines: Line[] | null, at: number): Line | undefined {
    let line: Line | undefined;
    for (const l of lines ?? []) {
        if (l.at > at) break;
        line = l;
    }
    return line;
}

/** How long until the next line starts, or undefined after the last one */
export function untilNextLine(lines: Line[] | null, at: number): number | undefined {
    const next = lines?.find(l => l.at > at);
    return next ? next.at - at : undefined;
}

/** A status Discord takes whole, never cut between the two halves of an emoji */
export function fitStatus(text: string): string {
    if (text.length <= MAX_STATUS_LENGTH) return text;
    let end = MAX_STATUS_LENGTH - 1;
    const last = text.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end--;
    return `${text.slice(0, end)}…`;
}

export const songLabel = (song: Song) => song.artists.length ? `${song.name} — ${song.artists.join(", ")}` : song.name;

const query = (params: Record<string, string>) => Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");

/** lrclib's answer, null when it has no such song, or throws when it couldn't be asked (no network, a timeout...) */
async function getJson(path: string, params: Record<string, string>, signal: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener?.("abort", abort);
    const timer = setTimeout(abort, 15_000);
    try {
        const res = await safeFetch(`${API}/${path}?${query(params)}`, { signal: controller.signal });
        return await readJson(res, MAX_REPLY_BYTES);
    } catch (e) {
        if (/non-ok: 404\b/.test(String((e as Error)?.message ?? e))) return null;
        throw e;
    } finally {
        clearTimeout(timer);
        signal.removeEventListener?.("abort", abort);
    }
}

const cache = new Map<string, Line[] | null>();

export const clearLyricsCache = () => cache.clear();

/** The song's timed lines, or null when the library has none (or only untimed ones) */
export async function findLyrics(song: Song, signal: AbortSignal): Promise<Line[] | null> {
    if (cache.has(song.id)) return cache.get(song.id)!;

    const seconds = song.duration / 1000;
    const artist = song.artists[0] ?? "";
    let failed = false;
    const ask = (path: string, params: Record<string, string>) => getJson(path, params, signal).catch(() => {
        failed = true;
        return null;
    });
    let result = usableLines(await ask("get", {
        track_name: song.name,
        artist_name: artist,
        album_name: song.album,
        duration: String(Math.round(seconds)),
    }) as LrcLibSong | null);

    // The exact lookup needs album and length to match, and anyone can upload, so it can also be junk. A search finds
    // the same song under other albums: the one closest in length wins
    if (!result && !signal.aborted) result = closestLyrics(await ask("search", { track_name: song.name, artist_name: artist }), seconds);

    // A lookup cut short, or one that couldn't reach lrclib, is tried again the next time the song plays
    if (signal.aborted || !result && failed) return result;
    cache.set(song.id, result);
    // Enough for an album or two; old songs make room
    if (cache.size > 60) cache.delete(cache.keys().next().value!);
    return result;
}
