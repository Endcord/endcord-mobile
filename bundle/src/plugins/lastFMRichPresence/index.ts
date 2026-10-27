/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { externalAsset, LASTFM_APP, setActivity } from "../shared/presence";

const LASTFM_KEY = "790c37d90400163a5a5fe00d6ca32ef0";

const LASTFM = "endcord:lastfm";

export default definePlugin({
    id: "endcord.lastfm-rich-presence",
    name: "LastFMRichPresence",
    description: tx("Shows what you're listening to on Last.fm as your Rich Presence"),
    icon: "MusicIcon",
    tags: ["Media", "Customisation"],
    settings: {
        username: { type: "string", label: tx("Last.fm username"), description: tx("Last.fm username"), default: "" },
        apiKey: { type: "string", label: tx("API key"), description: tx("Custom Last.fm API key. Not required but highly recommended to avoid rate limiting with our shared key"), default: "" },
        useListeningStatus: { type: "boolean", label: tx("Listening to"), description: tx("Show \"Listening to\" status instead of \"Playing\""), default: true },
        hideWithSpotify: { type: "boolean", label: tx("Hide while Spotify plays"), description: tx("Hide Last.fm presence if spotify is running"), default: true },
        showLastFmLogo: { type: "boolean", label: tx("Last.fm logo"), description: tx("Show the Last.fm logo by the album cover"), default: true },
    },
    start({ store, cleanup, logger }) {
        let lastTrack = "";
        const poll = async () => {
            if (!store.username.trim()) return setActivity(LASTFM, null);
            const me = getStore("UserStore")?.getCurrentUser?.()?.id;
            const spotify = (me && getStore("PresenceStore")?.getActivities?.(me) || []).some((a: any) => a?.type === 2 && a.name === "Spotify");
            if (store.hideWithSpotify && spotify) return setActivity(LASTFM, null);
            try {
                const query = `method=user.getrecenttracks&user=${encodeURIComponent(store.username.trim())}&api_key=${store.apiKey.trim() || LASTFM_KEY}&format=json&limit=1`;
                const data = await fetch(`https://ws.audioscrobbler.com/2.0/?${query}`).then(r => r.json());
                const track = data?.recenttracks?.track?.[0];
                if (!track?.["@attr"]?.nowplaying) {
                    lastTrack = "";
                    return setActivity(LASTFM, null);
                }
                const key = `${track.artist?.["#text"]}|${track.name}`;
                if (key === lastTrack) return;
                lastTrack = key;
                const art = track.image?.find((i: any) => i.size === "extralarge")?.["#text"];
                const large = art ? await externalAsset(LASTFM_APP, art).catch(() => undefined) : undefined;
                const logo = store.showLastFmLogo ? await externalAsset(LASTFM_APP, "https://www.last.fm/static/images/lastfm_avatar_twitter.52a5d69a85ac.png").catch(() => undefined) : undefined;
                setActivity(LASTFM, {
                    name: store.useListeningStatus ? track.artist?.["#text"] ?? "Last.fm" : "Last.fm",
                    application_id: LASTFM_APP,
                    type: store.useListeningStatus ? 2 : 0,
                    flags: 1,
                    details: track.name,
                    state: track.artist?.["#text"],
                    assets: {
                        large_image: large,
                        large_text: track.album?.["#text"] || undefined,
                        small_image: logo,
                        small_text: logo ? "Last.fm" : undefined,
                    },
                    buttons: [t("Open on Last.fm")],
                    metadata: { button_urls: [track.url] },
                });
            } catch (e) {
                logger.warn("Couldn't reach Last.fm", e);
            }
        };
        const timer = setInterval(poll, 16_000);
        cleanup(() => clearInterval(timer), () => setActivity(LASTFM, null));
        poll();
    },
});
