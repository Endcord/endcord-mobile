/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Your presence: rich presence, saved statuses, and how Discord treats you as idle.
 */

import { t, tx } from "@core/i18n";
import { createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { instead } from "@lib/api/patcher";
import { holdDiscordDeveloper } from "@lib/api/settings";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { FluxDispatcher } from "@metro/common";
import { Button, Stack } from "@metro/common/components";

import { definePlugin, ENDCORD_AUTHOR, onSettingChange } from "../api";
import { getStore, onAction } from "../common";
import { api, toastError } from "../hooks";
import { choose, prompt } from "../ui/dialogs";
import LogList from "../ui/LogList";

const ACTIVITY_TYPES = [
    { label: tx("Playing"), value: "0" },
    { label: tx("Listening to"), value: "2" },
    { label: tx("Watching"), value: "3" },
    { label: tx("Competing in"), value: "5" },
];

const assetCache = new Map<string, string>();

// Any real application can put a picture on Discord's media proxy, and the "mp:" path it gets works for every
// activity; this one (the Last.fm presence's) is used when you haven't given your own
const ASSET_APP = "1108588077900898414";

/** Discord shows outside images through its media proxy; an "mp:" path points there */
async function externalAsset(appId: string, url: string): Promise<string | undefined> {
    if (!/^https?:\/\//.test(url)) return url || undefined;
    if (assetCache.has(url)) return assetCache.get(url);
    const [asset] = await api("post", `/applications/${appId}/external-assets`, { urls: [url] });
    const path: string | undefined = asset?.external_asset_path;
    if (!path) return;
    const value = `mp:${path.replace(/^https:\/\/media\.discordapp\.net\//, "")}`;
    assetCache.set(url, value);
    return value;
}

function setActivity(socketId: string, activity: Record<string, unknown> | null) {
    FluxDispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", activity: activity ?? {}, socketId });
}

const CUSTOM_RPC = "endcord:custom-rpc";

const CustomRPC = definePlugin({
    id: "endcord.custom-rpc",
    name: "CustomRPC",
    description: tx("Add a fully customisable Rich Presence (Game status) to your Discord profile"),
    authors: [ENDCORD_AUTHOR],
    icon: "GameControllerIcon",
    tags: ["Customisation"],
    settings: {
        type: { type: "select", label: tx("Activity type"), default: "0", options: ACTIVITY_TYPES },
        name: { type: "string", label: tx("Name"), description: tx("The game or app name people see"), default: "Endcord" },
        details: { type: "string", label: tx("Details"), description: tx("The first line under the name"), default: "" },
        state: { type: "string", label: tx("State"), description: tx("The second line under the name"), default: "" },
        largeImage: { type: "string", label: tx("Large image"), description: tx("A link to an image"), placeholder: "https://…", default: "" },
        largeText: { type: "string", label: tx("Large image text"), default: "" },
        smallImage: { type: "string", label: tx("Small image"), description: tx("A link to an image"), placeholder: "https://…", default: "" },
        smallText: { type: "string", label: tx("Small image text"), default: "" },
        showElapsed: { type: "boolean", label: tx("Show elapsed time"), description: tx("Show how long the activity has been going"), default: true },
        button1Text: { type: "string", label: tx("First button text"), default: "" },
        button1Url: { type: "string", label: tx("First button link"), placeholder: "https://…", default: "" },
        button2Text: { type: "string", label: tx("Second button text"), default: "" },
        button2Url: { type: "string", label: tx("Second button link"), placeholder: "https://…", default: "" },
        appId: { type: "string", label: tx("Application ID"), description: tx("Optional; a Discord application whose name and art to use. Image links work without one."), default: "" },
    },
    start({ store, cleanup, logger }) {
        const started = Date.now();
        let generation = 0;
        const update = async () => {
            const current = ++generation;
            const appId = store.appId.trim() || "0";
            const image = async (url: string) => url.trim() ? externalAsset(appId !== "0" ? appId : ASSET_APP, url.trim()).catch(e => void logger.warn("Couldn't load an image", e)) : undefined;
            const [large, small] = await Promise.all([image(store.largeImage), image(store.smallImage)]);
            if (current !== generation) return;
            const buttons = [[store.button1Text, store.button1Url], [store.button2Text, store.button2Url]].filter(([text, url]) => text.trim() && /^https?:\/\//.test(url.trim()));
            setActivity(CUSTOM_RPC, {
                name: store.name.trim() || "Endcord",
                application_id: appId,
                type: Number(store.type),
                flags: 1,
                details: store.details.trim() || undefined,
                state: store.state.trim() || undefined,
                timestamps: store.showElapsed ? { start: started } : undefined,
                assets: {
                    large_image: large,
                    large_text: large ? store.largeText.trim() || undefined : undefined,
                    small_image: small,
                    small_text: small ? store.smallText.trim() || undefined : undefined,
                },
                buttons: buttons.length ? buttons.map(([text]) => text.trim()) : undefined,
                metadata: buttons.length ? { button_urls: buttons.map(([, url]) => url.trim()) } : undefined,
            });
        };
        // Typing in the settings changes many values in a row; the presence is sent once they settle
        let timer: ReturnType<typeof setTimeout> | undefined;
        cleanup(
            () => clearTimeout(timer),
            () => setActivity(CUSTOM_RPC, null),
            onSettingChange(store, () => {
                clearTimeout(timer);
                timer = setTimeout(update, 1500);
            }),
        );
        update();
    },
});

const LASTFM_KEY = "790c37d90400163a5a5fe00d6ca32ef0";
const LASTFM_APP = ASSET_APP;
const LASTFM = "endcord:lastfm";

const LastFMRichPresence = definePlugin({
    id: "endcord.lastfm-rich-presence",
    name: "LastFMRichPresence",
    description: tx("Shows what you're listening to on Last.fm as your Rich Presence"),
    authors: [ENDCORD_AUTHOR],
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

const LISTENBRAINZ = "endcord:listenbrainz";

const MusicRichPresence = definePlugin({
    id: "endcord.music-rich-presence",
    name: "MusicRichPresence",
    description: tx("Rich Presence for what you're playing, from ListenBrainz"),
    authors: [ENDCORD_AUTHOR],
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

interface StatusPreset {
    text: string;
    emojiName?: string;
    emojiId?: string;
    status?: string;
}

const presets = wrapSync(createStorage<{ items: StatusPreset[]; }>(createMMKVBackend("ENDCORD_STATUS_PRESETS", { items: [] })));
const presetList = () => Array.isArray(presets.items) ? presets.items : [];

function statusSettings() {
    return findByProps("CustomStatusSetting", "StatusSetting") ?? findByProps("CustomStatusSetting");
}

function applyPreset(preset: StatusPreset) {
    const settings = statusSettings();
    if (!settings?.CustomStatusSetting) throw new Error("Discord's status settings weren't found");
    settings.CustomStatusSetting.updateSetting({ text: preset.text, emojiName: preset.emojiName ?? "", emojiId: preset.emojiId ?? "0", expiresAtMs: "0" });
    if (preset.status) settings.StatusSetting?.updateSetting?.(preset.status);
}

function StatusPresetsPage() {
    useProxy(presets);
    const save = () => {
        const current = statusSettings()?.CustomStatusSetting?.getSetting?.();
        const status = statusSettings()?.StatusSetting?.getSetting?.();
        if (current?.text || current?.emojiName) {
            presets.items = [...presetList(), { text: current.text ?? "", emojiName: current.emojiName || undefined, emojiId: current.emojiId && current.emojiId !== "0" ? current.emojiId : undefined, status }];
            showToast(t("Saved your current status"), findAssetId("CheckmarkLargeIcon"));
            return;
        }
        prompt({
            title: t("New Status"),
            placeholder: t("What's on your mind?"),
            onSubmit: text => void (presets.items = [...presetList(), { text }]),
        });
    };
    return <Stack spacing={8}>
        <LogList
            title={t("Status Presets")}
            empty={t("Save your current status to set it again later in one tap")}
            entries={presetList().map((p, i) => ({
                key: String(i),
                label: `${p.emojiName && !p.emojiId ? `${p.emojiName} ` : ""}${p.text}`,
                subLabel: p.status ? t(p.status === "dnd" ? "Do Not Disturb" : p.status === "idle" ? "Idle" : p.status === "invisible" ? "Invisible" : "Online") : undefined,
                onPress: () => choose(p.text, [
                    { label: t("Set Status"), value: "set", icon: "CheckmarkLargeIcon" },
                    { label: t("Delete"), value: "delete", icon: "TrashIcon", danger: true },
                ], action => {
                    if (action === "delete") presets.items = presetList().filter((_, j) => j !== i);
                    else {
                        try {
                            applyPreset(p);
                            showToast(t("Status set"), findAssetId("CheckmarkLargeIcon"));
                        } catch (e) {
                            toastError(e);
                        }
                    }
                }),
            }))}
        />
        <Button text={t("Save Current Status")} variant="secondary" icon={findAssetId("PlusSmallIcon")} onPress={save} />
    </Stack>;
}

// The labels the presets page shows for statuses
void [tx("Do Not Disturb"), tx("Idle"), tx("Invisible"), tx("Online")];

const StatusPresets = definePlugin({
    id: "endcord.status-presets",
    name: "StatusPresets",
    description: tx("Allows you to remember your statuses and set them later"),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Customisation", "Utility"],
    SettingsComponent: StatusPresetsPage,
    start() { },
});

const Experiments = definePlugin({
    id: "endcord.experiments",
    name: "Experiments",
    description: tx("Enable Access to Experiments & other dev-only features in Discord!"),
    authors: [ENDCORD_AUTHOR],
    icon: "BeakerIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        // Held on while the plugin runs rather than written to the user's setting, which a restart in between would
        // otherwise leave on for good
        const release = holdDiscordDeveloper();
        getStore("DeveloperExperimentStore")?.emitChange?.();
        cleanup(() => {
            release();
            getStore("DeveloperExperimentStore")?.emitChange?.();
        });
    },
});

const AlwaysTrust = definePlugin({
    id: "endcord.always-trust",
    name: "AlwaysTrust",
    description: tx("Removes the annoying untrusted domain and suspicious file popup"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        const links = getStore("MaskedLinkStore");
        if (typeof links?.isTrustedDomain !== "function") throw new Error("Discord's link checks weren't found");
        cleanup(instead("isTrustedDomain", links, () => true));
        if (typeof links.isTrustedProtocol === "function") cleanup(instead("isTrustedProtocol", links, () => true));
    },
});

const CustomIdle = definePlugin({
    id: "endcord.custom-idle",
    name: "CustomIdle",
    description: tx("Stops Discord from marking you idle while the app is in the background"),
    authors: [ENDCORD_AUTHOR],
    icon: "BellZIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        // Discord marks you idle with this action when the app has been in the background
        cleanup(onAction<{ idle: boolean; }>("IDLE", ({ idle }) => idle ? { idle: false } : undefined));
    },
});

export default [CustomRPC, LastFMRichPresence, MusicRichPresence, StatusPresets, Experiments, AlwaysTrust, CustomIdle];
