/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * AudioBookShelf, as Endcord PC's RichPresence shows it: the book you're listening to, from your listening sessions
 * (one updated in the last 30 seconds), every 10 seconds. It signs in with your username and password, and keeps the
 * token it gets until the server stops taking it. A sign-in the server refuses waits a minute before the next, then
 * longer each time, until the settings change.
 */

import { type Activity, asset, getJson, line, num } from "./common";

export const ABS_APP = "1381423044907503636";

export interface AbsMedia {
    name: string;
    author?: string;
    series?: string;
    /** In seconds */
    duration?: number;
    currentTime?: number;
    imageUrl?: string;
}

const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The book being listened to now, from the server's list of sessions */
export function absMedia(answer: unknown, baseUrl: string, now: number): AbsMedia | null {
    const sessions = (answer as any)?.sessions;
    if (!Array.isArray(sessions)) return null;
    const session = sessions.slice(0, 200).find(s => s && typeof s === "object" && num(s.updatedAt) && !s.isFinished);
    if (!session || (now - session.updatedAt) / 1000 > 30) return null;
    const media = session.mediaMetadata;
    if (!media || typeof media !== "object") return null;
    const id = session.libraryItemId;
    return {
        name: line(media.title) ?? "Unknown",
        author: line(media.author) ?? line(media.publisher),
        series: line(Array.isArray(media.series) ? media.series[0]?.name : undefined),
        duration: num(session.duration),
        currentTime: num(session.currentTime),
        imageUrl: typeof id === "string" && ITEM_ID.test(id) ? `${baseUrl}/api/items/${id}/cover` : undefined,
    };
}

export function absActivity(media: AbsMedia, now: number): Activity {
    const timed = media.currentTime != null && media.duration != null;
    return {
        application_id: ABS_APP,
        name: "AudioBookShelf",
        details: media.name,
        state: line(media.series && media.author ? `${media.series} • ${media.author}` : media.author || "AudioBook"),
        assets: { large_text: media.series || media.author || undefined },
        timestamps: timed ? { start: now - media.currentTime! * 1000, end: now + (media.duration! - media.currentTime!) * 1000 } : undefined,
        type: 2,
        flags: 1,
    };
}

/** The longest wait before signing in again after the server refused it */
const MAX_SIGN_IN_WAIT = 30 * 60 * 1000;

/** Whether the server refused a sign-in: wrong username or password, or too many tries */
export const isRefusal = (e: unknown) => /\b(?:401|403|429)\b/.test(String((e as Error)?.message ?? e));

/** How long to wait before signing in again after this many refusals in a row: a minute, doubling, at most half an hour */
export const signInWait = (refusals: number) => Math.min(MAX_SIGN_IN_WAIT, 60_000 * 2 ** Math.max(0, refusals - 1));

export function audiobookshelf() {
    let token: string | null = null;
    // A wrong password isn't tried again every few seconds, which could lock the account on the server
    let refusals = 0, signInAfter = 0;

    const login = async (base: string, username: string, password: string, signal: AbortSignal) => {
        let answer: any;
        try {
            answer = await getJson(`${base}/login`, signal, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
        } catch (e) {
            if (isRefusal(e)) signInAfter = Date.now() + signInWait(++refusals);
            throw e;
        }
        const value = answer?.user?.token;
        token = typeof value === "string" && value && value.length < 4096 ? value : null;
        if (!token) throw new Error("AudioBookShelf didn't sign in");
        refusals = signInAfter = 0;
    };

    return {
        reset: () => {
            token = null;
            refusals = signInAfter = 0;
        },
        async presence(base: string, username: string, password: string, signal: AbortSignal): Promise<Activity | null> {
            if (!token && Date.now() < signInAfter) return null;
            if (!token) await login(base, username, password, signal);
            const sessions = (retried: boolean): Promise<unknown> => getJson(`${base}/api/me/listening-sessions`, signal, { headers: { Authorization: `Bearer ${token}` } })
                .catch(async e => {
                    // A token the server stopped taking: signed in again, once
                    if (retried || !/\b401\b/.test(String(e?.message))) throw e;
                    token = null;
                    await login(base, username, password, signal);
                    return sessions(true);
                });
            const media = absMedia(await sessions(false), base, Date.now());
            if (!media) return null;
            const activity = absActivity(media, Date.now());
            (activity.assets as Record<string, unknown>).large_image = await asset(ABS_APP, media.imageUrl ?? "audiobookshelf");
            return activity;
        },
    };
}
