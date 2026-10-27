/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { externalAsset, LASTFM_APP, setActivity } from "../shared/presence";

const LISTENBRAINZ = "endcord:listenbrainz";

export default definePlugin({
    id: "endcord.music-rich-presence",
    name: "MusicRichPresence",
    description: tx("Rich Presence for what you're playing, from ListenBrainz"),
    icon: "MusicIcon",
    tags: ["Media", "Customisation"],
    settings: {
        username: { type: "string", label: tx("ListenBrainz username"), default: "" },
        useListeningStatus: { type: "boolean", label: tx("Listening to"), description: tx("Show \"Listening to\" status instead of \"Playing\""), default: true },
        hideWithSpotify: { type: "boolean", label: tx("Hide while Spotify plays"), description: tx("Don't show it while Discord shows your Spotify"), default: true },
    },
    start({ store, cleanup, logger }) {
        let lastTrack = "";
        const poll = async () => {
            const user = store.username.trim();
            if (!user) return setActivity(LISTENBRAINZ, null);
            const me = getStore("UserStore")?.getCurrentUser?.()?.id;
            const spotify = (me && getStore("PresenceStore")?.getActivities?.(me) || []).some((a: any) => a?.type === 2 && a.name === "Spotify");
            if (store.hideWithSpotify && spotify) return setActivity(LISTENBRAINZ, null);
            try {
                const data = await fetch(`https://api.listenbrainz.org/1/user/${encodeURIComponent(user)}/playing-now`).then(r => r.json());
                const track = data?.payload?.listens?.[0]?.track_metadata;
                if (!track?.track_name) {
                    lastTrack = "";
                    return setActivity(LISTENBRAINZ, null);
                }
                const key = `${track.artist_name}|${track.track_name}`;
                if (key === lastTrack) return;
                lastTrack = key;
                const release = track.additional_info?.release_mbid ?? track.mbid_mapping?.release_mbid;
                const large = release ? await externalAsset(LASTFM_APP, `https://coverartarchive.org/release/${release}/front-250`).catch(() => undefined) : undefined;
                const link = track.additional_info?.origin_url ?? `https://listenbrainz.org/user/${encodeURIComponent(user)}/`;
                setActivity(LISTENBRAINZ, {
                    name: store.useListeningStatus ? track.artist_name ?? "ListenBrainz" : "ListenBrainz",
                    application_id: LASTFM_APP,
                    type: store.useListeningStatus ? 2 : 0,
                    flags: 1,
                    details: track.track_name,
                    state: track.artist_name,
                    assets: { large_image: large, large_text: track.release_name || undefined },
                    buttons: [t("Open")],
                    metadata: { button_urls: [link] },
                });
            } catch (e) {
                logger.warn("Couldn't reach ListenBrainz", e);
            }
        };
        const timer = setInterval(poll, 16_000);
        cleanup(() => clearInterval(timer), () => setActivity(LISTENBRAINZ, null));
        poll();
    },
});
