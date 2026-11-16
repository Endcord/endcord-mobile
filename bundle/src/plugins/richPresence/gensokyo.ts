/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Gensokyo Radio, as Endcord PC's RichPresence shows it: the song the station plays now. PC asks from its desktop
 * side to get past the browser's cross-site rules; React Native has none, so it's asked from here.
 */

import { type Activity, asset, getJson, line, num } from "./common";

export const GENSOKYO_APP = "1253772057926303804";
const ART = /^[A-Za-z0-9._-]{1,200}$/;

export function gensokyoActivity(answer: unknown): { activity: Activity; artwork?: string; } | null {
    const song = answer as any;
    const title = line(song?.SONGINFO?.TITLE);
    if (!title) return null;
    const start = num(song?.SONGTIMES?.SONGSTART), end = num(song?.SONGTIMES?.SONGEND);
    const art = song?.MISC?.ALBUMART;
    return {
        activity: {
            application_id: GENSOKYO_APP,
            name: "Gensokyo Radio",
            details: title,
            state: line(song?.SONGINFO?.ARTIST),
            // The station gives when the song started and ends, in seconds
            timestamps: start && end && end > start ? { start: start * 1000, end: end * 1000 } : undefined,
            type: 2,
            flags: 1,
        },
        artwork: typeof art === "string" && ART.test(art) ? `https://gensokyoradio.net/images/albums/500/${art}` : undefined,
    };
}

export async function gensokyoPresence(signal: AbortSignal): Promise<Activity | null> {
    const answer = await getJson("https://gensokyoradio.net/api/station/playing/", signal);
    const built = gensokyoActivity(answer);
    if (!built) return null;
    const [large, logo] = await Promise.all([asset(GENSOKYO_APP, built.artwork), asset(GENSOKYO_APP, "logo")]);
    built.activity.assets = { large_image: large, large_text: line((answer as any)?.SONGINFO?.ALBUM), small_image: logo, small_text: logo ? "Gensokyo Radio" : undefined };
    return built.activity;
}
