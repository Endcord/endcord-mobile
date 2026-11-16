/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * stats.fm, as Endcord PC's RichPresence shows it: what your public stats.fm profile is playing, every 16 seconds.
 */

import { type Activity, asset, getJson, line, num } from "./common";

export const STATSFM_APP = "1325126169179197500";
/** stats.fm's picture for an album without art */
const PLACEHOLDER_ID = "2a96cbd8b46e442fc41c2b86b821562f";
const USERNAME = /^[A-Za-z0-9._-]{1,64}$/;

export interface StatsFmSettings {
    sfm_username: string;
    sfm_shareUsername: boolean;
    sfm_shareSong: boolean;
    sfm_statusName: string;
    sfm_nameFormat: string;
    sfm_useListeningStatus: boolean;
    sfm_missingArt: string;
    sfm_showLogo: boolean;
    sfm_alwaysHideArt: boolean;
}

export interface StatsFmTrack {
    name: string;
    albums: string;
    artists: string;
    url: string;
    imageUrl?: string;
}

export const validUsername = (name: string) => USERNAME.test(name.trim());

export function statsFmTrack(answer: unknown): StatsFmTrack | null {
    const track = (answer as any)?.item?.track;
    if (!track || typeof track !== "object") return null;
    const albums: any[] = Array.isArray(track.albums) ? track.albums.slice(0, 10) : [];
    const id = num(track.id);
    const image = albums[0]?.image;
    return {
        name: line(track.name) ?? "Unknown",
        albums: line(albums.map(a => a?.name).filter(n => typeof n === "string" && n).join(", ")) ?? "Unknown",
        artists: line(Array.isArray(track.artists) ? track.artists[0]?.name : undefined) ?? "Unknown",
        url: id !== undefined ? `https://stats.fm/track/${id}` : "https://stats.fm",
        imageUrl: typeof image === "string" && image.startsWith("https://") ? image : undefined,
    };
}

/** The activity's name, as the name format says */
export function statsFmName(track: StatsFmTrack, settings: Pick<StatsFmSettings, "sfm_nameFormat" | "sfm_statusName">): string {
    const custom = line(settings.sfm_statusName) ?? "Stats.fm";
    switch (settings.sfm_nameFormat) {
        case "artist-first": return line(`${track.artists} - ${track.name}`)!;
        case "song-first": return line(`${track.name} - ${track.artists}`)!;
        case "artist": return track.artists;
        case "song": return track.name;
        case "album": return track.albums || custom;
        default: return custom;
    }
}

export function statsFmActivity(track: StatsFmTrack, settings: StatsFmSettings): { activity: Activity; largeImage?: string; } {
    const buttons: Array<[string, string]> = [];
    if (settings.sfm_shareUsername) buttons.push(["Stats.fm Profile", `https://stats.fm/${encodeURIComponent(settings.sfm_username.trim())}`]);
    if (settings.sfm_shareSong) buttons.push(["View Song", track.url]);
    const art = !settings.sfm_alwaysHideArt && track.imageUrl && !track.imageUrl.includes(PLACEHOLDER_ID) ? track.imageUrl : undefined;
    return {
        activity: {
            application_id: STATSFM_APP,
            name: statsFmName(track, settings),
            details: track.name,
            state: track.artists,
            buttons: buttons.length ? buttons.map(([label]) => label) : undefined,
            metadata: buttons.length ? { button_urls: buttons.map(([, url]) => url) } : undefined,
            type: settings.sfm_useListeningStatus ? 2 : 0,
            flags: 1,
        },
        // A missing picture is stats.fm's logo, or Discord's placeholder of the application
        largeImage: art ?? (settings.sfm_missingArt === "placeholder" ? "placeholder" : undefined),
    };
}

export async function statsFmPresence(settings: StatsFmSettings, signal: AbortSignal): Promise<Activity | null> {
    const track = statsFmTrack(await getJson(`https://api.stats.fm/api/v1/users/${encodeURIComponent(settings.sfm_username.trim())}/streams/current`, signal));
    if (!track) return null;
    const { activity, largeImage } = statsFmActivity(track, settings);
    const [large, logo] = await Promise.all([
        asset(STATSFM_APP, largeImage ?? "statsfm-large"),
        largeImage && settings.sfm_showLogo ? asset(STATSFM_APP, "statsfm-large") : undefined,
    ]);
    activity.assets = {
        large_image: large,
        large_text: track.albums || undefined,
        small_image: logo,
        small_text: logo ? "Stats.fm" : undefined,
    };
    return activity;
}
