/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's plugins for getting around the app: pinning and hiding DMs and servers, recent channels, counts, themes,
 * hiding the chat while you share your screen, and quick actions.
 *
 * What more than one of these plugins uses.
 */

import { t, tx } from "@core/i18n";
import { createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { isPluginEnabled } from "@lib/addons/plugins";
import { after } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { addChatButton, getChatInputActionButton, getStore, subscribe } from "../common";
import { botMessage, displayName, generatedIcon, getChannel, getGuild, getUser, jumpTo, toastError } from "../hooks";
import { choose } from "../ui/dialogs";
import LogList from "../ui/LogList";

export const BUTTON_OPTIONS = [
    { label: tx("Hidden"), value: "none" },
    { label: tx("Left of the message box"), value: "left" },
    { label: tx("Right of the message box"), value: "right" },
];

export const failed = toastError;

/** A chat bar button that runs `onPress`, shown on the side the plugin's `button` setting picks */
export function chatButton(key: string, store: { button: string; }, icon: string, label: () => string, onPress: () => unknown) {
    return addChatButton({
        key,
        side: () => store.button as "left" | "right" | "none",
        render: () => {
            const Button = getChatInputActionButton();
            const Icon = generatedIcon(icon);
            return Button && Icon ? <Button accessibilityLabel={label()} IconComponent={Icon} onPress={() => {
                try {
                    const result = onPress();
                    if (result instanceof Promise) result.catch(failed);
                } catch (e) {
                    failed(e);
                }
            }} /> : null;
        },
    });
}

/** A channel's name as the app shows it: #name, or the people in a DM */
export function channelLabel(channelId: string): string {
    const channel = getChannel(channelId);
    if (!channel) return channelId;
    if (channel.guild_id) return `#${channel.name} · ${getGuild(channel.guild_id)?.name ?? ""}`;
    if (channel.name) return channel.name;
    const ids: string[] = channel.recipients ?? (channel.getRecipientId ? [channel.getRecipientId()] : []);
    return ids.map(id => displayName(getUser(id)) || id).join(", ") || channelId;
}

/** Opens a channel or DM */
function openChannel(channelId: string) {
    const channel = getChannel(channelId);
    const router = findByProps("transitionToGuild");
    if (typeof router?.transitionToGuild === "function") return router.transitionToGuild(channel?.guild_id ?? "@me", channelId);
    if (channel?.lastMessageId) return jumpTo(channelId, channel.lastMessageId);
    throw new Error("Discord's navigation wasn't found");
}

/**
 * Changes what a store method returns. The result is cached for each value Discord returns, so the list only changes
 * when Discord's or ours does (Discord's lists redraw whenever they get a new array).
 */
export function rewriteResult(store: any, method: string, rewrite: (value: any) => any) {
    if (typeof store?.[method] !== "function") return undefined;
    let cache = new WeakMap<object, any>();
    const unpatch = after(method, store, (_, value) => {
        if (!value || typeof value !== "object") return value;
        if (!cache.has(value)) cache.set(value, rewrite(value));
        return cache.get(value);
    });
    return {
        unpatch,
        refresh() {
            cache = new WeakMap();
            store.emitChange?.();
        },
    };
}

/** The app link for a web link, for the services that have an app */
export function appLink(url: string): string | undefined {
    const spotify = url.match(/^https?:\/\/open\.spotify\.com\/(?:intl-[\w-]+\/)?(track|album|playlist|artist|episode|show|user)\/([\w.-]+)/);
    if (spotify) return `spotify:${spotify[1]}:${spotify[2]}`;
    if (/^https?:\/\/(store\.steampowered\.com|steamcommunity\.com)\//.test(url)) return `steam://openurl/${url}`;
    const tidal = url.match(/^https?:\/\/(?:listen\.)?tidal\.com\/(?:browse\/)?(track|album|playlist|artist|video)\/([\w-]+)/);
    if (tidal) return `tidal://${tidal[1]}/${tidal[2]}`;
    return undefined;
}

export const pins = wrapSync(createStorage<{ dms: string[]; servers: string[]; hidden: string[]; }>(createMMKVBackend("ENDCORD_PINS", { dms: [], servers: [], hidden: [] })));

export const listOf = (key: "dms" | "servers" | "hidden") => Array.isArray(pins[key]) ? pins[key] : [];

export function toggleIn(key: "dms" | "servers" | "hidden", id: string) {
    const list = listOf(key);
    const has = list.includes(id);
    pins[key] = has ? list.filter(x => x !== id) : [...list, id];
    return !has;
}

/** Puts the pinned IDs first, in the order they were pinned; works on lists of IDs and of channels */
export function pinnedFirst(list: any[], pinned: string[]) {
    if (!Array.isArray(list) || !pinned.length) return list;
    const idOf = (x: any): string => typeof x === "string" ? x : x?.id ?? x?.channelId ?? x?.channel?.id;
    const order = new Map(pinned.map((id, i) => [id, i]));
    const first = list.filter(x => order.has(idOf(x))).sort((a, b) => order.get(idOf(a))! - order.get(idOf(b))!);
    return first.length ? [...first, ...list.filter(x => !order.has(idOf(x)))] : list;
}

/** Server folders with the hidden servers left out and the pinned ones on top, each on its own */
function arrangeFolders(folders: any[], pinned: string[], hidden: string[]) {
    if (!Array.isArray(folders) || !pinned.length && !hidden.length) return folders;
    const skip = new Set([...pinned, ...hidden]);
    const single = folders.find(f => f?.folderId == null && f?.guildIds?.length === 1);
    const top = pinned.filter(id => !hidden.includes(id) && folders.some(f => f?.guildIds?.includes(id)))
        .map(id => ({ ...single ?? { folderId: undefined }, guildIds: [id] }));
    const rest = folders
        .map(f => f?.guildIds?.some((id: string) => skip.has(id)) ? { ...f, guildIds: f.guildIds.filter((id: string) => !skip.has(id)) } : f)
        .filter(f => !Array.isArray(f?.guildIds) || f.guildIds.length > 0);
    return [...top, ...rest];
}

export let refreshServers: (() => void) | undefined;

let serverPatchUsers = 0;

let unpatchServers: (() => void) | undefined;

/** One patch of the server list for both plugins */
export function holdServerPatch() {
    if (!unpatchServers) {
        const store = getStore("SortedGuildStore");
        const pinned = () => isPluginEnabled("endcord.server-pinner") ? listOf("servers") : [];
        const hidden = () => isPluginEnabled("endcord.hide-servers") ? listOf("hidden") : [];
        const folders = rewriteResult(store, "getGuildFolders", list => arrangeFolders(list, pinned(), hidden()));
        if (!folders) throw new Error("Discord's server list wasn't found");
        const flat = rewriteResult(store, "getFlattenedGuildIds", list => {
            const h = new Set(hidden());
            return pinnedFirst(list.filter((id: string) => !h.has(id)), pinned());
        });
        refreshServers = () => {
            folders.refresh();
            flat?.refresh();
        };
        unpatchServers = () => {
            folders.unpatch();
            flat?.unpatch();
            store?.emitChange?.();
        };
    }
    serverPatchUsers++;
    setTimeout(() => refreshServers?.(), 0);
    return () => {
        if (--serverPatchUsers > 0) return setTimeout(() => refreshServers?.(), 0);
        unpatchServers?.();
        unpatchServers = refreshServers = undefined;
    };
}

export function serverList(key: "servers" | "hidden", title: string, empty: string, action: string) {
    return function ServersPage() {
        useProxy(pins);
        return <LogList
            title={title}
            empty={empty}
            entries={listOf(key).map(id => ({
                key: id,
                label: getGuild(id)?.name ?? id,
                icon: key === "servers" ? "PinIcon" : "EyeSlashIcon",
                onPress: () => choose(getGuild(id)?.name ?? id, [{ label: action, value: id }], () => {
                    toggleIn(key, id);
                    refreshServers?.();
                }),
            }))}
        />;
    };
}

export const recents = wrapSync(createStorage<{ ids: string[]; }>(createMMKVBackend("ENDCORD_RECENT_CHANNELS", { ids: [] })));

let recentUsers = 0;

let stopRecording: (() => void) | undefined;

export function recordRecents() {
    if (!stopRecording) {
        stopRecording = subscribe("CHANNEL_SELECT", ({ channelId }) => {
            if (!channelId) return;
            const ids = Array.isArray(recents.ids) ? recents.ids : [];
            recents.ids = [channelId, ...ids.filter(id => id !== channelId)].slice(0, 25);
        });
    }
    recentUsers++;
    return () => {
        if (--recentUsers > 0) return;
        stopRecording?.();
        stopRecording = undefined;
    };
}

export function pickRecent(dmsOnly: boolean, channelId: string) {
    const ids = (Array.isArray(recents.ids) ? recents.ids : [])
        .filter(id => id !== channelId && getChannel(id) && (!dmsOnly || !getChannel(id).guild_id))
        .slice(0, 15);
    if (!ids.length) return botMessage(channelId, dmsOnly ? t("You haven't opened any other DMs yet.") : t("You haven't opened any other channels yet."));
    choose(dmsOnly ? t("Recent DMs") : t("Recent channels"), ids.map(id => ({ label: channelLabel(id), value: id })), id => {
        try {
            openChannel(id);
        } catch (e) {
            failed(e);
        }
    });
}

export function guildChannels(guildId: string, kind: "SELECTABLE" | "VOCAL"): any[] {
    const channels = getStore("GuildChannelStore")?.getChannels?.(guildId)?.[kind] ?? [];
    return channels.map((c: any) => c?.channel ?? c).filter(Boolean);
}
