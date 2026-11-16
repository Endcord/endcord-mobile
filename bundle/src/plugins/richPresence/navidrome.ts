/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Navidrome, as Endcord PC's RichPresence shows it: what your user plays, from the Subsonic API's now playing list.
 * The password never leaves the phone: the server gets md5(password + salt), with a new salt each time. Album art
 * comes from Last.fm only when you choose that, since it sends Last.fm the track.
 */

import { type Activity, asset, getJson, line, num } from "./common";
import { md5Hex } from "./md5";

export const NAVIDROME_APP = "1470554657506984069";
/** Endcord PC's shared Last.fm key, for when you don't give your own */
const LASTFM_KEY = "feff915bf5987580c9dc354d523dc6b9";
const APP_ID = /^\d{17,20}$/;

export interface NavidromeSettings {
    nd_username: string;
    nd_clientId: string;
    nd_showSmallImage: boolean;
    nd_showAlbum: boolean;
    nd_albumArtMode: string;
    nd_lastfmApiKey: string;
    nd_activityType: string;
    nd_nameString: string;
    nd_detailsString: string;
    nd_stateString: string;
    nd_largeTextString: string;
    nd_statusDisplayType: string;
    nd_hideOnPause: boolean;
}

export interface NavidromeTrack {
    id: string;
    title?: string;
    artist?: string;
    album?: string;
    year?: number;
    suffix?: string;
    bitRate?: number;
    /** In seconds */
    duration?: number;
    minutesAgo?: number;
    username?: string;
    state?: string;
    positionMs?: number;
}

/** The track your user plays, from the server's answer */
export function nowPlaying(answer: unknown, username: string): NavidromeTrack | null {
    const response = (answer as any)?.["subsonic-response"];
    if (!response || response.status === "failed") return null;
    const entries = response.nowPlaying?.entry;
    if (!Array.isArray(entries)) return null;
    const mine = entries.slice(0, 200).find(e => e && typeof e === "object" && typeof e.username === "string" && e.username.toLowerCase() === username.trim().toLowerCase());
    if (!mine || (typeof mine.id !== "string" && typeof mine.id !== "number")) return null;
    return {
        id: String(mine.id).slice(0, 100),
        title: line(mine.title),
        artist: line(mine.artist),
        album: line(mine.album),
        year: num(mine.year),
        suffix: line(mine.suffix),
        bitRate: num(mine.bitRate),
        duration: num(mine.duration),
        minutesAgo: num(mine.minutesAgo),
        username: mine.username,
        state: line(mine.state),
        positionMs: num(mine.positionMs),
    };
}

/** A format string with the track's {song}, {artist}, {album}, {year} and {quality} */
export function fillTrack(format: string | undefined, track: NavidromeTrack): string {
    if (!format) return "";
    const values: Record<string, string> = {
        song: track.title ?? "",
        artist: track.artist ?? "",
        album: track.album ?? "",
        year: track.year ? String(track.year) : "",
        quality: track.suffix ? `${track.suffix.toUpperCase()}${track.bitRate ? ` ${track.bitRate}kbps` : ""}` : "",
    };
    return format.slice(0, 300).replace(/\{(song|artist|album|year|quality)\}/g, (_, key: string) => values[key]);
}

/** The Subsonic sign-in: the user, md5(password + salt) and the salt */
export function subsonicAuth(username: string, password: string, salt: string): string {
    return `u=${encodeURIComponent(username)}&t=${md5Hex(password + salt)}&s=${salt}&v=1.12.0&c=endcord-rpc&f=json`;
}

const newSalt = () => Math.random().toString(36).slice(2, 8).padEnd(6, "0");

export function navidrome() {
    let trackId: string | undefined;
    let startedAt: number | undefined;
    let pausedAt: number | undefined;
    let lastMinutesAgo: number | undefined;
    const artCache = new Map<string, string | null>();

    const reset = () => {
        trackId = startedAt = pausedAt = lastMinutesAgo = undefined;
    };

    const lastFmArt = async (track: NavidromeTrack, apiKey: string, signal: AbortSignal): Promise<string | null> => {
        if (!track.artist) return null;
        const key = `${track.id}:${apiKey}`;
        if (artCache.has(key)) return artCache.get(key)!;
        let image: string | undefined;
        try {
            const base = `https://ws.audioscrobbler.com/2.0/?api_key=${encodeURIComponent(apiKey)}&artist=${encodeURIComponent(track.artist)}&format=json`;
            const last = (list: unknown) => Array.isArray(list) ? list.at(-1)?.["#text"] : undefined;
            if (track.album) image = last((await getJson(`${base}&method=album.getinfo&album=${encodeURIComponent(track.album)}`, signal))?.album?.image);
            if (!image && track.title) image = last((await getJson(`${base}&method=track.getinfo&track=${encodeURIComponent(track.title)}`, signal))?.track?.album?.image);
        } catch (e) {
            if (signal.aborted) throw e;
        }
        const url = typeof image === "string" && image.startsWith("https://") ? image : null;
        if (artCache.size > 200) artCache.clear();
        artCache.set(key, url);
        return url;
    };

    return {
        reset() {
            reset();
            artCache.clear();
        },
        async presence(base: string, password: string, settings: NavidromeSettings, signal: AbortSignal): Promise<Activity | null> {
            const answer = await getJson(`${base}/rest/getNowPlaying?${subsonicAuth(settings.nd_username.trim(), password, newSalt())}`, signal);
            const track = nowPlaying(answer, settings.nd_username);
            if (!track) {
                reset();
                return null;
            }
            const paused = track.state?.toLowerCase() === "paused";
            if (paused && settings.nd_hideOnPause) {
                pausedAt = undefined;
                return null;
            }
            const now = Date.now();
            const minutesAgo = track.minutesAgo ?? 0;
            if (track.id !== trackId || !startedAt) {
                trackId = track.id;
                startedAt = now - (track.positionMs ?? minutesAgo * 60_000);
            } else if (track.positionMs !== undefined) {
                // Moved by more than two seconds: the song was skipped through
                if (!paused && Math.abs(now - startedAt - track.positionMs) > 2000) startedAt = now - track.positionMs;
            } else if (minutesAgo < (lastMinutesAgo ?? 0) || minutesAgo > (lastMinutesAgo ?? 0) + 1) startedAt = now - minutesAgo * 60_000;
            lastMinutesAgo = minutesAgo;
            pausedAt = paused ? pausedAt ?? now : undefined;

            const durationMs = (track.duration ?? 0) * 1000;
            const endsAt = startedAt + durationMs;
            if (!paused && durationMs > 0 && now >= endsAt) return null;

            const type = ["0", "2", "3"].includes(settings.nd_activityType) ? Number(settings.nd_activityType) : 2;
            const name = type !== 0 ? fillTrack(settings.nd_nameString || "Navidrome", track) : "Navidrome";
            const details = fillTrack(settings.nd_detailsString, track);
            let state = fillTrack(settings.nd_stateString, track);
            if (paused) state = state ? `${state} (Paused)` : "Paused";
            const assets: Record<string, unknown> = {};
            const largeText = settings.nd_showAlbum ? fillTrack(settings.nd_largeTextString, track) : "";
            if (largeText) {
                if (type === 0) state = state ? `${state} • ${largeText}` : largeText;
                else assets.large_text = line(largeText);
            }

            const clientId = settings.nd_clientId.trim();
            const appId = APP_ID.test(clientId) ? clientId : NAVIDROME_APP;
            const art = settings.nd_albumArtMode === "lastfm" ? await lastFmArt(track, settings.nd_lastfmApiKey.trim() || LASTFM_KEY, signal) : null;
            const [large, small] = await Promise.all([
                asset(appId, art ?? "navidrome"),
                settings.nd_showSmallImage ? asset(appId, "navidrome") : undefined,
            ]);
            assets.large_image = large;
            if (small) {
                assets.small_image = small;
                assets.small_text = "Navidrome";
            }
            const display = ({ off: 0, artist: 1, track: 2 } as Record<string, number>)[settings.nd_statusDisplayType];
            return {
                application_id: appId,
                name: line(name) ?? "Navidrome",
                details: line(details),
                state: line(state),
                status_display_type: display,
                type: paused ? 0 : type,
                flags: 1,
                timestamps: paused ? { start: pausedAt } : { start: startedAt, end: durationMs > 0 ? endsAt : undefined },
                assets,
            };
        },
    };
}
