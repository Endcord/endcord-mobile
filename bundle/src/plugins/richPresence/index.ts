/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's RichPresence: what you play on AudioBookShelf, stats.fm, Jellyfin, Navidrome or Gensokyo Radio as your
 * Rich Presence, each turned on by its own switch and asked as often as on PC. Presences are set the way CustomRPC
 * and LastFMRichPresence set theirs. osu! isn't here: PC reads it from tosu, a program running next to osu! on the
 * computer, which a phone can't reach.
 *
 * Server addresses must be https (plain http only for a server on this phone), and not on your local network: covers
 * are fetched by Discord, and passwords and keys must not travel unencrypted. They and the keys are sensitive
 * settings, kept out of backups.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, onSettingChange } from "../api";
import { currentUserId, getStore } from "../common";
import { setActivity } from "../shared/presence";
import { audiobookshelf } from "./audiobookshelf";
import { type Activity, clearAssetCache, sameActivity, serverBase } from "./common";
import { gensokyoPresence } from "./gensokyo";
import { jellyfinPresence } from "./jellyfin";
import { navidrome } from "./navidrome";
import { STATSFM_APP, statsFmPresence, validUsername } from "./statsfm";

const ACTIVITY_TYPES = [
    { label: tx("Listening"), value: "2" },
    { label: tx("Playing (Fixes hidden lines)"), value: "0" },
    { label: tx("Watching"), value: "3" },
];

const plugin = definePlugin({
    id: "endcord.rich-presence",
    name: "RichPresence",
    description: tx("Rich presence for what you play on AudioBookShelf, stats.fm, Jellyfin, Navidrome and Gensokyo Radio"),
    icon: "GameControllerIcon",
    tags: ["Media", "Customisation"],
    settings: {
        // AudioBookShelf
        abs_enabled: { type: "boolean", label: tx("Enable AudioBookShelf presence."), description: tx("Display your currently playing audiobooks as Discord Rich Presence. Requires your AudioBookShelf server URL, username, and password."), default: false },
        abs_serverUrl: { type: "string", label: tx("AudioBookShelf server URL."), placeholder: "https://abs.example.com", default: "", sensitive: true },
        abs_username: { type: "string", label: tx("AudioBookShelf username."), default: "" },
        abs_password: { type: "string", label: tx("AudioBookShelf password."), default: "", sensitive: true },

        // stats.fm
        sfm_enabled: { type: "boolean", label: tx("Enable stats.fm presence."), description: tx("Show what you're currently listening to via stats.fm. Requires your listening history to be public."), default: false },
        sfm_shareUsername: { type: "boolean", label: tx("Show link to stats.fm profile."), default: false },
        sfm_shareSong: { type: "boolean", label: tx("Show link to song on stats.fm."), default: true },
        sfm_hideWithSpotify: { type: "boolean", label: tx("Hide stats.fm presence if Spotify is running."), default: false },
        sfm_hideWithExternalRPC: { type: "boolean", label: tx("Hide stats.fm presence if an external RPC is running."), default: false },
        sfm_useListeningStatus: { type: "boolean", label: tx("Show listening status."), default: true },
        sfm_showLogo: { type: "boolean", label: tx("Show Stats.fm logo next to album art."), default: true },
        sfm_alwaysHideArt: { type: "boolean", label: tx("Disable downloading album art."), default: false },
        sfm_username: { type: "string", label: tx("Stats.fm username."), default: "" },
        sfm_statusName: { type: "string", label: tx("Custom status text."), default: "Stats.fm" },
        sfm_nameFormat: {
            type: "select", label: tx("Name format."), default: "status-name", options: [
                { label: tx("Use custom status name"), value: "status-name" },
                { label: tx("Use format 'artist - song'"), value: "artist-first" },
                { label: tx("Use format 'song - artist'"), value: "song-first" },
                { label: tx("Use artist name only"), value: "artist" },
                { label: tx("Use song name only"), value: "song" },
                { label: tx("Use album name"), value: "album" },
            ],
        },
        sfm_missingArt: {
            type: "select", label: tx("Fallback when art is missing."), default: "StatsFmLogo", options: [
                { label: tx("Use large Stats.fm logo"), value: "StatsFmLogo" },
                { label: tx("Use generic placeholder"), value: "placeholder" },
            ],
        },

        // Jellyfin
        jf_enabled: { type: "boolean", label: tx("Enable Jellyfin presence."), default: false },
        jf_serverUrl: { type: "string", label: tx("Jellyfin server URL."), placeholder: "https://jellyfin.example.com", default: "", sensitive: true },
        jf_apiKey: { type: "string", label: tx("Jellyfin API key."), description: tx("Make one in Jellyfin's dashboard, under API Keys"), default: "", sensitive: true },
        jf_userId: { type: "string", label: tx("Jellyfin user ID."), description: tx("User ID from profile URL"), default: "" },
        jf_nameDisplay: {
            type: "select", label: tx("Name display format."), default: "default", options: [
                { label: tx("Series/Movie Name"), value: "default" },
                { label: tx("Series - Episode/Track/Movie Name"), value: "full" },
                { label: tx("Custom"), value: "custom" },
            ],
        },
        jf_customName: { type: "string", label: tx("Custom name template."), placeholder: "{series} - {name} ({year})", default: "" },
        jf_coverType: {
            type: "select", label: tx("Cover type for TV shows."), default: "series", options: [
                { label: tx("Series Cover"), value: "series" },
                { label: tx("Episode Cover"), value: "episode" },
            ],
        },
        jf_episodeFormat: {
            type: "select", label: tx("Episode number format."), default: "long", options: [
                { label: "S01E01", value: "long" },
                { label: "1x01", value: "short" },
                { label: tx("Season 1 Episode 1"), value: "fulltext" },
            ],
        },
        jf_overrideType: {
            type: "select", label: tx("Override rich presence type."), default: "off", options: [
                { label: tx("Off"), value: "off" },
                { label: tx("Listening"), value: "2" },
                { label: tx("Playing"), value: "0" },
                { label: tx("Streaming"), value: "1" },
                { label: tx("Watching"), value: "3" },
            ],
        },
        jf_showEpisodeName: { type: "boolean", label: tx("Show episode name after season/episode info."), default: false },
        jf_showPausedState: { type: "boolean", label: tx("Show presence when media is paused."), default: true },
        jf_privacyMode: { type: "boolean", label: tx("Hide media details."), default: false },

        // Navidrome
        nd_enabled: { type: "boolean", label: tx("Enable Navidrome presence."), description: tx("Show what you're currently listening to via Navidrome."), default: false },
        nd_showSmallImage: { type: "boolean", label: tx("Show Navidrome logo in bottom right of album art."), default: false },
        nd_showAlbum: { type: "boolean", label: tx("Show album name in presence."), default: true },
        nd_hideOnPause: { type: "boolean", label: tx("Hide Rich Presence when music is paused"), default: true },
        nd_serverUrl: { type: "string", label: tx("Navidrome Server URL (e.g. https://navidrome.example.com)"), placeholder: "https://navidrome.example.com", default: "", sensitive: true },
        nd_username: { type: "string", label: tx("Navidrome username."), default: "" },
        nd_password: { type: "string", label: tx("Navidrome password."), default: "", sensitive: true },
        nd_clientId: { type: "string", label: tx("Optional Discord Application Client ID."), default: "" },
        nd_refreshInterval: { type: "number", label: tx("Refresh interval in seconds."), description: tx("Navidrome"), default: 10, min: 5, max: 60 },
        nd_activityType: { type: "select", label: tx("Which type of activity"), default: "2", options: ACTIVITY_TYPES },
        nd_nameString: { type: "string", label: tx("Activity name format string"), description: tx("The 'Listening to' text (e.g. {artist})"), default: "Navidrome" },
        nd_detailsString: { type: "string", label: tx("Activity details format string"), description: tx("The main line showing what song is playing (e.g. {song})"), default: "{song}" },
        nd_stateString: { type: "string", label: tx("Activity state format string"), description: tx("The line below the song name (e.g. {artist})"), default: "{artist}" },
        nd_largeTextString: { type: "string", label: tx("Activity large text format string"), description: tx("The album line (e.g. {album})"), default: "{album}" },
        nd_statusDisplayType: {
            type: "select", label: tx("Show the track / artist name in the member list"), default: "artist", options: [
                { label: tx("Don't show (shows generic listening message)"), value: "off" },
                { label: tx("Show artist name"), value: "artist" },
                { label: tx("Show track name"), value: "track" },
            ],
        },
        nd_albumArtMode: {
            type: "select", label: tx("How to fetch album art."), default: "none", options: [
                { label: tx("None"), value: "none" },
                { label: tx("Last.fm API (Sends track metadata to Last.fm)"), value: "lastfm" },
            ],
        },
        nd_lastfmApiKey: { type: "string", label: tx("Optional Last.fm API Key"), default: "", sensitive: true },

        // Gensokyo Radio
        gr_enabled: { type: "boolean", label: tx("Enable Gensokyo Radio presence."), description: tx("Discord rich presence for Gensokyo Radio. Just enable it and listen!"), default: false },
        gr_refreshInterval: { type: "number", label: tx("Refresh interval in seconds."), description: tx("Gensokyo Radio"), default: 15, min: 5, max: 60 },
    },
    start({ store, cleanup, logger }) {
        const abs = audiobookshelf();
        const nd = navidrome();
        let requests = new AbortController();
        const timers = new Set<ReturnType<typeof setTimeout>>();
        const warned = new Set<string>();

        /** Says once per start what's wrong with a service's settings */
        const misconfigured = (service: string, message: string) => {
            if (warned.has(service)) return;
            warned.add(service);
            showToast(message, findAssetId("CircleXIcon-primary"));
        };

        const notSetUp = (service: string) => {
            misconfigured(service, t("{service} isn't set up: check RichPresence's settings", { service }));
            return null;
        };

        const server = (service: string, url: string) => {
            const checked = serverBase(url);
            if ("base" in checked) return checked.base;
            if (checked.error === "insecure" || checked.error === "private") {
                misconfigured(service, t("{service} needs an https:// address on the internet: plain http only works for a server on this phone", { service }));
            } else notSetUp(service);
        };

        const myActivities = (): any[] => {
            const me = currentUserId();
            return (me && getStore("PresenceStore")?.getActivities?.(me)) || [];
        };

        interface Service {
            socket: string;
            enabled(): boolean;
            interval(): number;
            presence(signal: AbortSignal): Promise<Activity | null | undefined>;
        }

        const services: Service[] = [
            {
                socket: "endcord:rich-presence-abs",
                enabled: () => store.abs_enabled,
                interval: () => 10_000,
                presence: async signal => {
                    const base = server("AudioBookShelf", store.abs_serverUrl);
                    if (!base) return null;
                    if (!store.abs_username.trim() || !store.abs_password) return notSetUp("AudioBookShelf");
                    return abs.presence(base, store.abs_username.trim(), store.abs_password, signal).catch(e => {
                        // Signing in is tried again later, waiting longer each time, until the settings change
                        if (/\b40[13]\b/.test(String(e?.message))) misconfigured("AudioBookShelf", t("AudioBookShelf didn't accept your username or password. Check RichPresence's settings."));
                        throw e;
                    });
                },
            },
            {
                socket: "endcord:rich-presence-statsfm",
                enabled: () => store.sfm_enabled,
                interval: () => 16_000,
                presence: async signal => {
                    if (!validUsername(store.sfm_username)) return notSetUp("stats.fm");
                    const others = myActivities().filter(a => a?.application_id !== STATSFM_APP && a?.type !== 4);
                    if (store.sfm_hideWithExternalRPC && others.length) return null;
                    if (store.sfm_hideWithSpotify && others.some(a => a?.type === 2)) return null;
                    return statsFmPresence(store, signal);
                },
            },
            {
                socket: "endcord:rich-presence-jellyfin",
                enabled: () => store.jf_enabled,
                interval: () => 10_000,
                presence: async signal => {
                    const base = server("Jellyfin", store.jf_serverUrl);
                    if (!base) return null;
                    if (!store.jf_apiKey.trim() || !store.jf_userId.trim()) return notSetUp("Jellyfin");
                    return jellyfinPresence(base, store.jf_apiKey.trim(), store.jf_userId.trim(), store, signal).catch(e => {
                        // A page instead of JSON, or a refusal: usually the key
                        if (e instanceof SyntaxError || /\b40[13]\b/.test(String(e?.message))) misconfigured("Jellyfin", t("Jellyfin returned an invalid response. Your API key may be wrong."));
                        throw e;
                    });
                },
            },
            {
                socket: "endcord:rich-presence-navidrome",
                enabled: () => store.nd_enabled,
                interval: () => store.nd_refreshInterval * 1000,
                presence: async signal => {
                    const base = server("Navidrome", store.nd_serverUrl);
                    if (!base) return null;
                    if (!store.nd_username.trim() || !store.nd_password) return notSetUp("Navidrome");
                    return nd.presence(base, store.nd_password, store, signal);
                },
            },
            {
                socket: "endcord:rich-presence-gensokyo",
                enabled: () => store.gr_enabled,
                interval: () => store.gr_refreshInterval * 1000,
                presence: gensokyoPresence,
            },
        ];

        let generation = 0;
        /** What each service shows now, so the same presence isn't sent again every few seconds */
        const shown = new Map<string, Activity>();
        const show = (socket: string, activity: Activity | null) => {
            const before = shown.get(socket) ?? null;
            if (sameActivity(before, activity)) return;
            if (activity) shown.set(socket, activity);
            else shown.delete(socket);
            setActivity(socket, activity);
        };

        const run = (service: Service, current: number) => {
            const { signal } = requests;
            const next = () => {
                if (current !== generation) return;
                const timer = setTimeout(() => {
                    timers.delete(timer);
                    run(service, current);
                }, Math.max(5000, service.interval()));
                timers.add(timer);
            };
            // One request at a time: the next waits until this one is done, however slow the network is
            service.presence(signal).then(activity => {
                if (current === generation) show(service.socket, activity ?? null);
            }, e => {
                if (current !== generation) return;
                logger.warn(`${service.socket} couldn't be updated`, e);
                show(service.socket, null);
            }).finally(next);
        };

        const startAll = () => {
            const current = ++generation;
            requests.abort();
            requests = new AbortController();
            for (const timer of timers) clearTimeout(timer);
            timers.clear();
            abs.reset();
            nd.reset();
            warned.clear();
            for (const service of services) {
                show(service.socket, null);
                if (service.enabled()) run(service, current);
            }
        };

        // Typing in the settings changes many values in a row; the services start again once they settle
        let restart: ReturnType<typeof setTimeout> | undefined;
        cleanup(
            () => {
                generation++;
                clearTimeout(restart);
                requests.abort();
                for (const timer of timers) clearTimeout(timer);
                for (const service of services) show(service.socket, null);
                clearAssetCache();
            },
            onSettingChange(store, () => {
                clearTimeout(restart);
                restart = setTimeout(startAll, 1500);
            }),
        );
        startAll();
    },
});

export default plugin;
