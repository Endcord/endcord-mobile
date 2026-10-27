/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Your presence: rich presence, saved statuses, and how Discord treats you as idle.
 *
 * What more than one of the CustomRPC, LastFMRichPresence and MusicRichPresence plugins uses.
 */

import { tx } from "@core/i18n";
import { FluxDispatcher } from "@metro/common";

import { api } from "../hooks";

const assetCache = new Map<string, string>();

// Any real application can put a picture on Discord's media proxy, and the "mp:" path it gets works for every
// activity; this one (the Last.fm presence's) is used when you haven't given your own
export const ASSET_APP = "1108588077900898414";

/** Discord shows outside images through its media proxy; an "mp:" path points there */
export async function externalAsset(appId: string, url: string): Promise<string | undefined> {
    if (!/^https?:\/\//.test(url)) return url || undefined;
    if (assetCache.has(url)) return assetCache.get(url);
    const [asset] = await api("post", `/applications/${appId}/external-assets`, { urls: [url] });
    const path: string | undefined = asset?.external_asset_path;
    if (!path) return;
    const value = `mp:${path.replace(/^https:\/\/media\.discordapp\.net\//, "")}`;
    assetCache.set(url, value);
    return value;
}

export function setActivity(socketId: string, activity: Record<string, unknown> | null) {
    FluxDispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", activity: activity ?? {}, socketId });
}

export const LASTFM_APP = ASSET_APP;

// The labels the presets page shows for statuses
void [tx("Do Not Disturb"), tx("Idle"), tx("Invisible"), tx("Online")];
