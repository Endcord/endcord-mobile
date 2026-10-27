/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { after } from "@lib/api/patcher";

import { definePlugin } from "../api";
import { getStore } from "../common";

export default definePlugin({
    id: "endcord.show-song-name",
    name: "ShowSongName",
    description: tx("Shows song name instead of artist for Spotify activity"),
    icon: "MusicIcon",
    tags: ["Friends", "Media"],
    start({ cleanup }) {
        const presences = getStore("PresenceStore");
        if (typeof presences?.getActivities !== "function") throw new Error("Discord's presence store wasn't found");
        // Kept per list Discord returns, so screens see the same list (and activities) until the song changes
        const renamed = new WeakMap<object, any[]>();
        cleanup(after("getActivities", presences, (_, result: any[]) => {
            if (!Array.isArray(result) || !result.some(a => a?.type === 2 && a.name === "Spotify" && a.details)) return result;
            if (!renamed.has(result)) renamed.set(result, result.map(a => a?.type === 2 && a.name === "Spotify" && a.details ? { ...a, name: a.details } : a));
            return renamed.get(result);
        }));
    },
});
