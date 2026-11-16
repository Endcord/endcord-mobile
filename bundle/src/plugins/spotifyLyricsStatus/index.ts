/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's SpotifyLyricsStatus: the line of the Spotify song you're listening to as your custom status, in time with
 * the song, from lrclib.net. Discord for Android follows your Spotify account the way the desktop app does (its
 * SpotifyStore and the SPOTIFY_PLAYER_STATE updates), whichever device plays, so it works the same here; the lines only
 * move while Discord runs, and a line left up when Android stops Discord clears itself after ten minutes, like on PC.
 *
 * Your own status is kept from before the first line and put back afterwards, unless you set another one meanwhile
 * (here, or on another device while Discord was closed): that one is yours, and it stays.
 */

import { tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";
import { findByProps } from "@metro";

import { definePlugin } from "../api";
import { getStore, subscribe } from "../common";
import { clearLyricsCache, findLyrics, fitStatus, type Line, lineAt, type Song, songLabel, untilNextLine } from "./lyrics";

interface CustomStatus {
    text?: string;
    emojiId?: string;
    emojiName?: string;
    expiresAtMs?: string;
    createdAtMs?: string;
}

interface SpotifyTrack {
    id?: string | null;
    name?: string;
    duration?: number;
    album?: { name?: string; };
    artists?: Array<{ name?: string; }>;
}

/** Lines go up this much early, since others see a status change a moment after it's made */
const LEAD = 400;
/**
 * A lyric status clears itself this long after its last change, in case Discord stops while it's up: ten minutes and
 * seven milliseconds, a length none of the "Clear after" choices gives, which is how a line an earlier run left up is
 * told from a status you set
 */
export const EXPIRES_AFTER = 10 * 60 * 1000 + 7;
/** A line still up this long before it runs out is put up again, so a long song without lyrics keeps it */
const RENEW_BEFORE = 60 * 1000;
/** A pause shorter than this, like the gap between two songs, keeps the lyrics up */
const PAUSE_GRACE = 4000;
/** How long a line an earlier run left up waits for your account's settings, before your own status comes back */
const SETTINGS_WAIT = 15_000;
/** How many of the lines put up are remembered, to tell them from a status you set */
const REMEMBERED = 20;

// The status from before the lyrics, kept so it comes back even after Discord was closed mid-song
const kept = wrapSync(createStorage<{ saved?: { status: CustomStatus | null; } | null; }>(createMMKVBackend("ENDCORD_SPOTIFY_LYRICS_STATUS", {})));

const customStatusSetting = () => (findByProps("CustomStatusSetting", "StatusSetting") ?? findByProps("CustomStatusSetting"))?.CustomStatusSetting;

/** A status with nothing in it: no text and no emoji */
export const isEmptyStatus = (status: CustomStatus | null | undefined) => !(status?.text || status?.emojiName || status?.emojiId && status.emojiId !== "0");

/** Whether a status lasts exactly as long as the lyrics' do, which marks one of them, from this run or an earlier one */
export const hasLyricLength = (status: CustomStatus | null | undefined) => Number(status?.expiresAtMs) - Number(status?.createdAtMs) === EXPIRES_AFTER;

/** The least time between two changes, in ms: the setting held to its range, which a restored backup isn't checked against */
export function minGapMs(seconds: unknown): number {
    const value = Number(seconds);
    return (Number.isFinite(value) ? Math.min(8, Math.max(2, value)) : 3) * 1000;
}

export function songFromTrack(track: SpotifyTrack | null | undefined): Song | null {
    if (!track || typeof track.name !== "string" || !track.name) return null;
    const artists = (Array.isArray(track.artists) ? track.artists : []).map(a => a?.name).filter((n): n is string => typeof n === "string" && !!n);
    return {
        // Local files have no id
        id: track.id || `${track.name}|${artists.join(",")}`,
        name: track.name,
        artists,
        album: track.album?.name ?? "",
        duration: Number(track.duration) || 0,
    };
}

/** The Spotify activity Discord shows, as a song and how far into it you are, for when the plugin starts mid-song */
export function songFromActivity(activity: any, now: number): { song: Song; position: number; } | undefined {
    const { start, end } = activity?.timestamps ?? {};
    if (typeof activity?.details !== "string" || !activity.details || typeof start !== "number" || typeof end !== "number" || end <= start) return;
    return {
        song: {
            id: activity.sync_id ?? activity.details,
            name: activity.details,
            artists: String(activity.state ?? "").split("; ").filter(Boolean),
            album: activity.assets?.large_text ?? "",
            duration: end - start,
        },
        position: now - start,
    };
}

export default definePlugin({
    id: "endcord.spotify-lyrics-status",
    name: "SpotifyLyricsStatus",
    description: tx("Shows the line of the Spotify song you're listening to as your custom status, in time with the song. Needs Spotify connected to Discord"),
    icon: "SpotifyNeutralIcon",
    tags: ["Fun", "Media"],
    settings: {
        emoji: { type: "string", label: tx("Emoji"), description: tx("Emoji in front of each line. Leave empty for none"), default: "🎵" },
        songBetweenLines: { type: "boolean", label: tx("Song name between lines"), description: tx("Show the song's name between lines, and for songs without lyrics"), default: true },
        minGap: { type: "number", label: tx("Least time between changes"), description: tx("Least time between two status changes, in seconds. Too low and Discord starts refusing them"), default: 3, min: 2, max: 8 },
    },
    async start({ store, cleanup, logger }) {
        const setting = customStatusSetting();
        if (typeof setting?.getSetting !== "function" || typeof setting.updateSetting !== "function") throw new Error("Discord's status settings weren't found");
        const spotify = getStore("SpotifyStore");
        if (!spotify) throw new Error("Discord's Spotify store wasn't found");
        await awaitStorage(kept);

        let running = true;
        const requests = new AbortController();
        let song: Song | null = null;
        let playing = false;
        /** Where the song was, in ms, and when that was read */
        let position = 0, positionAt = 0;
        let lines: Line[] | null = null;
        /** The line up now, or null for your own status */
        let shown: string | null = null;
        let lastWrite = 0;
        /** When the line up now runs out, and when it's put up again before that */
        let expiresAt = 0, renewAt = Infinity;
        let lineTimer: ReturnType<typeof setTimeout> | undefined;
        let pauseTimer: ReturnType<typeof setTimeout> | undefined;
        /** Set when you change your status while lyrics are up: the lyrics leave it alone until the next song */
        let userTookOver = false;
        /** Your status from an earlier run, kept until it's known whether you set another since */
        let checkLeftOver = !!kept.saved;
        /** The texts of the last lines put up */
        const written: string[] = [];

        const now = () => Date.now();
        const songPosition = () => playing ? position + (now() - positionAt) : position;

        /** A lyric line: one put up now, or one an earlier run left */
        const isLyric = (status: CustomStatus | null | undefined) => !!status && (typeof status.text === "string" && written.includes(status.text) || hasLyricLength(status));
        /** Whether what's up isn't a status you set: a lyric line, or nothing because the last one ran out */
        const notYours = (status: CustomStatus | null | undefined) => isLyric(status) || isEmptyStatus(status) && now() >= expiresAt;

        /** What the status should say right now, or null for your own status */
        const currentText = (): string | null => {
            if (!song || !playing) return null;
            const line = lineAt(lines, songPosition() + LEAD);
            if (line?.text) return line.text;
            return store.songBetweenLines ? songLabel(song) : null;
        };

        const readStatus = (): CustomStatus | null => {
            const status = setting.getSetting();
            // Nothing, or a line an earlier run left up, which isn't yours to bring back
            if (isEmptyStatus(status) || isLyric(status)) return null;
            // All its fields, as on PC, as long as they can be stored
            return Object.fromEntries(Object.entries(status).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v)));
        };

        /** Whether Discord took the change */
        const writeStatus = async (status: CustomStatus | null): Promise<boolean> => {
            lastWrite = now();
            try {
                await setting.updateSetting(status ?? undefined);
                return true;
            } catch (e) {
                logger.warn("Discord didn't take the status change", e);
                return false;
            }
        };

        const show = (text: string) => {
            // Your own status, kept once, before the first line goes up
            if (!kept.saved) kept.saved = { status: readStatus() };
            const before = { shown, expiresAt, renewAt };
            const fitted = fitStatus(text);
            const at = now();
            shown = text;
            expiresAt = at + EXPIRES_AFTER;
            renewAt = expiresAt - RENEW_BEFORE;
            if (!written.includes(fitted)) {
                written.push(fitted);
                if (written.length > REMEMBERED) written.shift();
            }
            void writeStatus({
                text: fitted,
                emojiId: "0",
                emojiName: String(store.emoji ?? "").trim(),
                expiresAtMs: String(expiresAt),
                createdAtMs: String(at),
            }).then(ok => {
                // Not taken: what's up is still what was before, and this line goes up the next time it may
                if (!ok && shown === text) ({ shown, expiresAt, renewAt } = before);
            });
        };

        /** Puts your own status back */
        const restore = () => {
            const { saved } = kept;
            const before = shown;
            shown = null;
            renewAt = Infinity;
            if (!saved) return;
            kept.saved = null;
            const status = saved.status ? { ...saved.status } : null;
            // One that ran out while the lyrics were up stays gone
            const expired = !!status?.expiresAtMs && status.expiresAtMs !== "0" && Number(status.expiresAtMs) < now();
            void writeStatus(expired ? null : status).then(ok => {
                // Not taken: tried again when the plugin stops, or the next time it starts
                if (ok || kept.saved) return;
                kept.saved = saved;
                shown ??= before;
            });
        };

        /** Puts your own status back, unless you set another meanwhile, which then stays */
        const putBackYours = () => {
            checkLeftOver = false;
            if (!kept.saved) return;
            if (notYours(setting.getSetting())) restore();
            else {
                kept.saved = null;
                shown = null;
            }
        };

        const update = () => {
            clearTimeout(lineTimer);
            lineTimer = undefined;
            if (!running) return;

            if (checkLeftOver) {
                checkLeftOver = false;
                // Your status from an earlier run: unless you set another since, which is the one to keep for this song
                if (kept.saved && !notYours(setting.getSetting())) {
                    kept.saved = null;
                    userTookOver = true;
                }
            }
            if (shown != null) {
                const status = setting.getSetting();
                if (!isLyric(status)) {
                    shown = null;
                    renewAt = Infinity;
                    // Gone because it ran out (Discord was in the background): it goes up again below. Anything else is
                    // your new status, the one to keep, and the lyrics wait for the next song
                    if (!(isEmptyStatus(status) && now() >= expiresAt)) {
                        userTookOver = true;
                        kept.saved = null;
                    }
                }
            }
            if (userTookOver) return;

            const text = currentText();
            if (text == null) {
                if (shown != null) restore();
            } else if (text !== shown || now() >= renewAt) {
                const wait = lastWrite + minGapMs(store.minGap) - now();
                if (wait > 0) {
                    // Too soon after the last change: tried again when allowed, with whatever line is current then
                    lineTimer = setTimeout(update, wait);
                    return;
                }
                show(text);
            }

            const nextLine = playing ? untilNextLine(lines, songPosition() + LEAD) : undefined;
            const renew = shown != null ? renewAt - now() : undefined;
            const next = nextLine == null ? renew : renew == null ? nextLine : Math.min(nextLine, renew);
            if (next != null) lineTimer = setTimeout(update, Math.max(next, 50));
        };

        const setSong = async (next: Song | null) => {
            if (next?.id === song?.id) return;
            song = next;
            lines = null;
            userTookOver = false;
            if (!next) return;
            try {
                const found = await findLyrics(next, requests.signal);
                // Another song may have started while this one's lyrics loaded
                if (song?.id === next.id) lines = found;
            } catch (e) {
                logger.warn("Couldn't load the lyrics", e);
            }
        };

        const setPlaying = (isPlaying: boolean) => {
            clearTimeout(pauseTimer);
            pauseTimer = undefined;
            if (isPlaying) {
                playing = true;
                return;
            }
            // Paused: the line stays a moment, since a new song often starts with a short pause
            position = songPosition();
            positionAt = now();
            pauseTimer = setTimeout(() => {
                playing = false;
                update();
            }, PAUSE_GRACE);
        };

        const follow = async (e: { track?: SpotifyTrack | null; isPlaying?: boolean; position?: number; }, at: number) => {
            if (!running) return;
            try {
                const next = songFromTrack(e?.track);
                position = Number(e?.position) || 0;
                positionAt = at;
                setPlaying(!!e?.isPlaying && !!next);
                if (next?.id !== song?.id) await setSong(next);
                update();
            } catch (err) {
                logger.error("Couldn't follow the song", err);
            }
        };

        cleanup(
            subscribe("SPOTIFY_PLAYER_STATE", (e: { track?: SpotifyTrack | null; isPlaying?: boolean; position?: number; }) => {
                if (!running) return;
                // Changing the status is a Flux action of its own, which Discord refuses while it handles another: the
                // song is followed right after
                const at = now();
                setTimeout(() => void follow(e, at), 0);
            }),
            () => {
                running = false;
                requests.abort();
                clearTimeout(lineTimer);
                clearTimeout(pauseTimer);
                // Yours back, unless you set another while the lyrics were up. One an earlier run kept, which wasn't
                // checked yet against your account's settings, waits for the next start
                if (!checkLeftOver) putBackYours();
                clearLyricsCache();
            },
        );

        let current: ReturnType<typeof songFromActivity> = undefined;
        try {
            current = songFromActivity(spotify.getActivity?.(), now());
        } catch { }
        if (current) {
            ({ position } = current);
            positionAt = now();
            playing = true;
            // The lyrics load in the background, so a slow network doesn't hold up the plugin's start
            setSong(current.song).then(update, e => logger.warn("Couldn't load the lyrics", e));
        } else if (checkLeftOver) {
            // Discord stopped mid-song last time, and nothing plays now: your status comes back once your account's
            // settings are in, since another device may have changed it meanwhile
            let settled = false;
            const settle = () => {
                if (settled || !running) return;
                settled = true;
                clearTimeout(timer);
                unsubscribe();
                // A song that started meanwhile takes it from here
                if (checkLeftOver && !song) putBackYours();
            };
            const timer = setTimeout(settle, SETTINGS_WAIT);
            const unsubscribe = subscribe("CONNECTION_OPEN", () => setTimeout(settle, 0));
            cleanup(unsubscribe, () => clearTimeout(timer));
        }

        try {
            if (spotify.hasConnectedAccount?.() === false) logger.warn("No Spotify account is connected to Discord yet: the lyrics start once one is");
        } catch { }
    },
});
