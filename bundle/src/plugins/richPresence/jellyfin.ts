/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Jellyfin, as Endcord PC's RichPresence shows it: what your user plays, from the server's sessions, every 10 seconds.
 * The API key goes in a header, never in the link.
 */

import { type Activity, asset, formatDuration, getJson, line, num } from "./common";

export const JELLYFIN_APP = "1381368130164625469";

export interface JellyfinSettings {
    jf_nameDisplay: string;
    jf_customName: string;
    jf_coverType: string;
    jf_episodeFormat: string;
    jf_showEpisodeName: boolean;
    jf_overrideType: string;
    jf_showPausedState: boolean;
    jf_privacyMode: boolean;
}

export interface JellyfinMedia {
    name: string;
    type: string;
    artist?: string;
    album?: string;
    seriesName?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    year?: number;
    imageUrl?: string;
    /** In seconds */
    duration?: number;
    position?: number;
    isPaused: boolean;
}

const ITEM_ID = /^[0-9a-f-]{1,64}$/i;

/** What your user plays, from the server's list of sessions */
export function jellyfinMedia(sessions: unknown, userId: string, baseUrl: string, settings: Pick<JellyfinSettings, "jf_coverType" | "jf_showPausedState">): JellyfinMedia | null {
    if (!Array.isArray(sessions)) return null;
    const session = sessions.slice(0, 200).find(s => s && typeof s === "object" && s.UserId === userId && s.NowPlayingItem && typeof s.NowPlayingItem === "object");
    if (!session) return null;
    const item = session.NowPlayingItem;
    const paused = !!session.PlayState?.IsPaused;
    if (paused && !settings.jf_showPausedState) return null;
    const type = line(item.Type) ?? "Unknown";
    const coverId = type === "Episode" && settings.jf_coverType === "series" && typeof item.SeriesId === "string" ? item.SeriesId : item.Id;
    const ticks = (value: unknown) => {
        const n = num(value);
        return n !== undefined && n >= 0 ? Math.floor(n / 10_000_000) : undefined;
    };
    return {
        name: line(item.Name) ?? "Unknown",
        type,
        artist: line(Array.isArray(item.Artists) ? item.Artists[0] : undefined) ?? line(item.AlbumArtist),
        album: line(item.Album),
        seriesName: line(item.SeriesName),
        seasonNumber: num(item.ParentIndexNumber),
        episodeNumber: num(item.IndexNumber),
        year: num(item.ProductionYear),
        // The server's own picture of it, which Discord fetches through its media proxy
        imageUrl: item.ImageTags?.Primary && typeof coverId === "string" && ITEM_ID.test(coverId) ? `${baseUrl}/Items/${coverId}/Images/Primary` : undefined,
        duration: ticks(item.RunTimeTicks),
        position: ticks(session.PlayState?.PositionTicks),
        isPaused: paused,
    };
}

const pad = (n: number) => String(n).padStart(2, "0");

function episodeText(media: JellyfinMedia, format: string): string {
    const season = media.seasonNumber, episode = media.episodeNumber;
    if (season != null && episode != null) {
        if (format === "short") return `${season}x${pad(episode)}`;
        if (format === "fulltext") return `Season ${season} Episode ${episode}`;
        return `S${pad(season)}E${pad(episode)}`;
    }
    if (season != null) return format === "fulltext" ? `Season ${season}` : `S${pad(season)}`;
    if (episode != null) return format === "fulltext" ? `Episode ${episode}` : `E${pad(episode)}`;
    return "";
}

/** The activity for what plays, as PC words it; the picture is filled in separately */
export function jellyfinActivity(media: JellyfinMedia, settings: JellyfinSettings, now: number): Activity {
    const hidden = settings.jf_privacyMode;
    const episode = media.type === "Episode" && !!media.seriesName;
    // A function, so a "$&" in a title stays as it is
    const values: Record<string, string> = {
        name: media.name,
        series: media.seriesName ?? "",
        season: media.seasonNumber?.toString() ?? "",
        episode: media.episodeNumber?.toString() ?? "",
        artist: media.artist ?? "",
        album: media.album ?? "",
        year: media.year?.toString() ?? "",
    };
    const fill = (template: string) => template.replace(/\{(name|series|season|episode|artist|album|year)\}/g, (_, key: string) => values[key]);

    let name: string;
    if (settings.jf_nameDisplay === "full") {
        if (episode) name = hidden ? `${media.seriesName} - [Episode Hidden]` : `${media.seriesName} - ${media.name}`;
        else if (media.type === "Audio") name = hidden ? "[Track Hidden]" : `${media.artist || "Unknown Artist"} - ${media.name}`;
        else name = hidden ? "[Movie Hidden]" : media.name || "Jellyfin";
    } else if (settings.jf_nameDisplay === "custom") {
        name = fill(settings.jf_customName.trim().slice(0, 200) || "{name} on Jellyfin");
        if (hidden) {
            for (const [value, label] of [[media.name, "[Title Hidden]"], [media.seriesName, "[Series Hidden]"], [media.artist, "[Artist Hidden]"], [media.album, "[Album Hidden]"]] as const) {
                if (value) name = name.split(value).join(label);
            }
        }
    } else name = episode ? media.seriesName! : hidden ? "[Media Hidden]" : media.name || "Jellyfin";

    let details = episode ? hidden ? "Watching a TV Show" : media.seriesName! : hidden ? "Watching Something" : media.name;
    if (media.isPaused) details += " - Paused";

    let state: string | undefined;
    if (episode) {
        const number = episodeText(media, settings.jf_episodeFormat);
        state = settings.jf_showEpisodeName && media.name && !hidden ? [number, media.name].filter(Boolean).join(" - ") : number;
    } else if (hidden) state = media.type === "Audio" ? "Listening to music" : media.year ? "(????)" : undefined;
    else state = media.artist || (media.year ? `(${media.year})` : undefined);
    if (media.isPaused) {
        const time = media.position != null && media.duration != null ? `${formatDuration(media.position * 1000)} / ${formatDuration(media.duration * 1000)}` : undefined;
        state = [state, time].filter(Boolean).join(" - ") || "Paused";
    }

    const override = settings.jf_overrideType;
    const type = override !== "off" && ["0", "1", "2", "3"].includes(override) ? Number(override) : media.type === "Audio" ? 2 : 3;
    const playing = !media.isPaused && media.position != null && media.duration != null;
    return {
        application_id: JELLYFIN_APP,
        name: line(name) ?? "Jellyfin",
        details: line(details),
        state: line(state) ?? "something",
        assets: { large_text: line(media.seriesName ?? media.album) },
        timestamps: playing ? { start: now - media.position! * 1000, end: now + (media.duration! - media.position!) * 1000 } : undefined,
        type,
        flags: 1,
    };
}

export async function jellyfinPresence(base: string, apiKey: string, userId: string, settings: JellyfinSettings, signal: AbortSignal): Promise<Activity | null> {
    // A key in the link would end up in server and proxy logs
    const sessions = await getJson(`${base}/Sessions`, signal, { headers: { Authorization: `MediaBrowser Token="${apiKey.replace(/["\\\r\n]/g, "")}"` } });
    const media = jellyfinMedia(sessions, userId, base, settings);
    if (!media) return null;
    const activity = jellyfinActivity(media, settings, Date.now());
    const image = !settings.jf_privacyMode && media.imageUrl ? await asset(JELLYFIN_APP, media.imageUrl) : undefined;
    if (image) (activity.assets as Record<string, unknown>).large_image = image;
    return activity;
}
