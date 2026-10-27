/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's plugins for getting around the app: pinning and hiding DMs and servers, recent channels, counts, themes,
 * hiding the chat while you share your screen, and quick actions.
 */

import { toggleSafeMode } from "@core/debug/safeMode";
import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { disablePlugin, isPluginEnabled } from "@lib/addons/plugins";
import { getCurrentTheme, selectTheme, themes } from "@lib/addons/themes";
import { findAssetId, iterateAssets } from "@lib/api/assets";
import { getDebugInfo } from "@lib/api/debug";
import { BundleUpdaterManager } from "@lib/api/native/modules";
import { after, instead } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { Stack, TextInput } from "@metro/common/components";
import { useMemo, useState } from "react";
import { Linking } from "react-native";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addChatButton, currentUserId, getChatInputActionButton, getStore, getToolboxActions, subscribe } from "../common";
import {
    api, botMessage, command, copy, displayName, generatedIcon, getChannel, getGuild, getUser, jumpTo,
    onMessageRow, redrawChannel, RowOrder, textNode, toastError
} from "../hooks";
import { manifest } from "../manifest";
import { choose, prompt } from "../ui/dialogs";
import LogList from "../ui/LogList";

const BUTTON_OPTIONS = [
    { label: tx("Hidden"), value: "none" },
    { label: tx("Left of the message box"), value: "left" },
    { label: tx("Right of the message box"), value: "right" },
];

const failed = toastError;

/** A chat bar button that runs `onPress`, shown on the side the plugin's `button` setting picks */
function chatButton(key: string, store: { button: string; }, icon: string, label: () => string, onPress: () => unknown) {
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
function channelLabel(channelId: string): string {
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
function rewriteResult(store: any, method: string, rewrite: (value: any) => any) {
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

// ConsoleJanitor -------------------------------------------------------------------------------------------------------

const ConsoleJanitor = definePlugin({
    id: "endcord.console-janitor",
    name: "ConsoleJanitor",
    description: tx("Turns off Discord's console logging, which saves work on slower phones"),
    authors: [ENDCORD_AUTHOR],
    icon: "TrashIcon",
    tags: ["Utility"],
    settings: {
        keepWarnings: { type: "boolean", label: tx("Keep warnings"), description: tx("Still log warnings, which help when reporting a problem"), default: true },
    },
    start({ store, cleanup }) {
        const original = { log: console.log, info: console.info, debug: console.debug, warn: console.warn };
        const quiet = () => { };
        console.log = console.info = console.debug = quiet;
        if (!store.keepWarnings) console.warn = quiet;
        cleanup(() => Object.assign(console, original));
    },
});

// OpenInApp ------------------------------------------------------------------------------------------------------------

/** The app link for a web link, for the services that have an app */
export function appLink(url: string): string | undefined {
    const spotify = url.match(/^https?:\/\/open\.spotify\.com\/(?:intl-[\w-]+\/)?(track|album|playlist|artist|episode|show|user)\/([\w.-]+)/);
    if (spotify) return `spotify:${spotify[1]}:${spotify[2]}`;
    if (/^https?:\/\/(store\.steampowered\.com|steamcommunity\.com)\//.test(url)) return `steam://openurl/${url}`;
    const tidal = url.match(/^https?:\/\/(?:listen\.)?tidal\.com\/(?:browse\/)?(track|album|playlist|artist|video)\/([\w-]+)/);
    if (tidal) return `tidal://${tidal[1]}/${tidal[2]}`;
    return undefined;
}

const OpenInApp = definePlugin({
    id: "endcord.open-in-app",
    name: "OpenInApp",
    description: tx("Open links in their respective apps instead of your browser"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkExternalSmallIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        const openApp = Linking.openURL.bind(Linking);
        const targets = new Set([Linking, findByProps("openURLExternally")].filter(Boolean));
        for (const target of targets) {
            for (const key of ["openURL", "openURLExternally"]) {
                if (typeof target[key] !== "function") continue;
                cleanup(instead(key, target, (args, orig) => {
                    const app = typeof args[0] === "string" ? appLink(args[0]) : undefined;
                    // Without the app installed, the link opens as it always did
                    return app ? openApp(app).catch(() => orig(...args)) : orig(...args);
                }));
            }
        }
    },
});

// PinDMs ---------------------------------------------------------------------------------------------------------------

const pins = wrapSync(createStorage<{ dms: string[]; servers: string[]; hidden: string[]; }>(createMMKVBackend("ENDCORD_PINS", { dms: [], servers: [], hidden: [] })));
const listOf = (key: "dms" | "servers" | "hidden") => Array.isArray(pins[key]) ? pins[key] : [];

function toggleIn(key: "dms" | "servers" | "hidden", id: string) {
    const list = listOf(key);
    const has = list.includes(id);
    pins[key] = has ? list.filter(x => x !== id) : [...list, id];
    return !has;
}

/** Puts the pinned IDs first, in the order they were pinned; works on lists of IDs and of channels */
function pinnedFirst(list: any[], pinned: string[]) {
    if (!Array.isArray(list) || !pinned.length) return list;
    const idOf = (x: any): string => typeof x === "string" ? x : x?.id ?? x?.channelId ?? x?.channel?.id;
    const order = new Map(pinned.map((id, i) => [id, i]));
    const first = list.filter(x => order.has(idOf(x))).sort((a, b) => order.get(idOf(a))! - order.get(idOf(b))!);
    return first.length ? [...first, ...list.filter(x => !order.has(idOf(x)))] : list;
}

function PinnedDMsPage() {
    useProxy(pins);
    return <LogList
        title={t("Pinned DMs")}
        empty={t("Open a DM and use /pindm to pin it")}
        entries={listOf("dms").map(id => ({
            key: id,
            label: channelLabel(id),
            icon: "PinIcon",
            onPress: () => choose(channelLabel(id), [{ label: t("Unpin"), value: id }], () => {
                toggleIn("dms", id);
                PinDMs.refresh?.();
            }),
        }))}
    />;
}

const PinDMs = Object.assign(definePlugin({
    id: "endcord.pin-dms",
    name: "PinDMs",
    description: tx("Pin DMs to the top of your DM list with /pindm"),
    authors: [ENDCORD_AUTHOR],
    icon: "PinIcon",
    tags: ["Friends", "Utility"],
    SettingsComponent: PinnedDMsPage,
    async start({ cleanup }) {
        await awaitStorage(pins);
        const store = getStore("PrivateChannelSortStore");
        const patches = ["getPrivateChannelIds", "getSortedPrivateChannels"]
            .map(method => rewriteResult(store, method, list => pinnedFirst(list, listOf("dms"))))
            .filter(p => p !== undefined);
        if (!patches.length) throw new Error("Discord's DM list wasn't found");
        PinDMs.refresh = () => patches.forEach(p => p.refresh());
        cleanup(
            () => patches.forEach(p => p.unpatch()),
            () => store?.emitChange?.(),
            command({
                name: "pindm",
                description: tx("Pin or unpin this DM"),
                run: (_, ctx) => {
                    if (ctx.channel.guild_id) return botMessage(ctx.channel.id, t("Use it in a DM."));
                    const pinned = toggleIn("dms", ctx.channel.id);
                    PinDMs.refresh?.();
                    showToast(pinned ? t("Pinned") : t("Unpinned"), findAssetId("PinIcon"));
                },
            }),
        );
    },
}), { refresh: undefined as undefined | (() => void) });

// HideServers / ServerPinner -------------------------------------------------------------------------------------------

/** Server folders with the hidden servers left out and the pinned ones on top, each on its own */
export function arrangeFolders(folders: any[], pinned: string[], hidden: string[]) {
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

let refreshServers: (() => void) | undefined;
let serverPatchUsers = 0;
let unpatchServers: (() => void) | undefined;

/** One patch of the server list for both plugins */
function holdServerPatch() {
    if (!unpatchServers) {
        const store = getStore("SortedGuildStore");
        const pinned = () => isPluginEnabled(ServerPinner.id) ? listOf("servers") : [];
        const hidden = () => isPluginEnabled(HideServers.id) ? listOf("hidden") : [];
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

function serverList(key: "servers" | "hidden", title: string, empty: string, action: string) {
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

const HideServers = definePlugin({
    id: "endcord.hide-servers",
    name: "HideServers",
    description: tx("Hide servers from your server list with /hideserver, and bring them back from the plugin's settings"),
    authors: [ENDCORD_AUTHOR],
    icon: "EyeSlashIcon",
    tags: ["Servers"],
    SettingsComponent: serverList("hidden", tx("Hidden servers"), tx("Use /hideserver in a server to hide it"), tx("Show again")),
    async start({ cleanup }) {
        await awaitStorage(pins);
        cleanup(
            holdServerPatch(),
            command({
                name: "hideserver",
                description: tx("Hide this server from your server list"),
                run: (_, ctx) => {
                    const guildId = ctx.channel.guild_id;
                    if (!guildId) return botMessage(ctx.channel.id, t("Use it in a server."));
                    if (!listOf("hidden").includes(guildId)) toggleIn("hidden", guildId);
                    refreshServers?.();
                    showToast(t("{server} is hidden from your server list", { server: getGuild(guildId)?.name ?? guildId }), findAssetId("EyeSlashIcon"));
                },
            }),
        );
    },
});

const ServerPinner = definePlugin({
    id: "endcord.server-pinner",
    name: "ServerPinner",
    description: tx("Pin servers to the top of your server list with /pinserver, without changing your folders"),
    authors: [ENDCORD_AUTHOR],
    icon: "PinIcon",
    tags: ["Servers"],
    SettingsComponent: serverList("servers", tx("Pinned servers"), tx("Use /pinserver in a server to pin it"), tx("Unpin")),
    async start({ cleanup }) {
        await awaitStorage(pins);
        cleanup(
            holdServerPatch(),
            command({
                name: "pinserver",
                description: tx("Pin or unpin this server at the top of your server list"),
                run: (_, ctx) => {
                    const guildId = ctx.channel.guild_id;
                    if (!guildId) return botMessage(ctx.channel.id, t("Use it in a server."));
                    const pinned = toggleIn("servers", guildId);
                    refreshServers?.();
                    showToast(pinned ? t("Pinned") : t("Unpinned"), findAssetId("PinIcon"));
                },
            }),
        );
    },
});

// RecentChannelSwitcher / RecentDMSwitcher -----------------------------------------------------------------------------

const recents = wrapSync(createStorage<{ ids: string[]; }>(createMMKVBackend("ENDCORD_RECENT_CHANNELS", { ids: [] })));
let recentUsers = 0;
let stopRecording: (() => void) | undefined;

function recordRecents() {
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

function pickRecent(dmsOnly: boolean, channelId: string) {
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

const RecentChannelSwitcher = definePlugin({
    id: "endcord.recent-channel-switcher",
    name: "RecentChannelSwitcher",
    description: tx("Go back to the channels and DMs you opened recently with /recent"),
    authors: [ENDCORD_AUTHOR],
    icon: "ClockIcon",
    tags: ["Utility"],
    async start({ cleanup }) {
        await awaitStorage(recents);
        cleanup(recordRecents(), command({ name: "recent", description: tx("Switch to a channel you opened recently"), run: (_, ctx) => pickRecent(false, ctx.channel.id) }));
    },
});

const RecentDMSwitcher = definePlugin({
    id: "endcord.recent-dm-switcher",
    name: "RecentDMSwitcher",
    description: tx("Go back to the DMs you opened recently with /recentdms"),
    authors: [ENDCORD_AUTHOR],
    icon: "ClockIcon",
    tags: ["Friends", "Utility"],
    async start({ cleanup }) {
        await awaitStorage(recents);
        cleanup(recordRecents(), command({ name: "recentdms", description: tx("Switch to a DM you opened recently"), run: (_, ctx) => pickRecent(true, ctx.channel.id) }));
    },
});

// UnreadCountBadge / VoiceCount / ServerListIndicators -----------------------------------------------------------------

function guildChannels(guildId: string, kind: "SELECTABLE" | "VOCAL"): any[] {
    const channels = getStore("GuildChannelStore")?.getChannels?.(guildId)?.[kind] ?? [];
    return channels.map((c: any) => c?.channel ?? c).filter(Boolean);
}

const UnreadCountBadge = definePlugin({
    id: "endcord.unread-count-badge",
    name: "UnreadCountBadge",
    description: tx("See how many unread messages each channel of a server has with /unread"),
    authors: [ENDCORD_AUTHOR],
    icon: "ChatIcon",
    tags: ["Utility", "Servers"],
    start({ cleanup }) {
        cleanup(command({
            name: "unread",
            description: tx("List this server's channels with unread messages"),
            run: (_, ctx) => {
                const reads = getStore("ReadStateStore");
                const guildId = ctx.channel.guild_id;
                const channels = guildId ? guildChannels(guildId, "SELECTABLE") : (getStore("PrivateChannelSortStore")?.getPrivateChannelIds?.() ?? []).map((id: string) => getChannel(id)).filter(Boolean);
                const lines = channels.flatMap((c: any) => {
                    const count: number = reads?.getUnreadCount?.(c.id) ?? 0;
                    const mentions: number = reads?.getMentionCount?.(c.id) ?? 0;
                    if (!count && !mentions && !reads?.hasUnread?.(c.id)) return [];
                    const parts = [count ? t("{count} unread", { count }) : t("unread"), mentions ? t("{count} mentions", { count: mentions }) : ""].filter(Boolean);
                    return [`${guildId ? `<#${c.id}>` : channelLabel(c.id)} · ${parts.join(" · ")}`];
                });
                botMessage(ctx.channel.id, lines.length ? lines.slice(0, 40).join("\n") : t("Everything here is read."));
            },
        }));
    },
});

const VoiceCount = definePlugin({
    id: "endcord.voice-count",
    name: "VoiceCount",
    description: tx("See how many people are in each voice channel of a server with /voicecount"),
    authors: [ENDCORD_AUTHOR],
    icon: "VoiceNormalIcon",
    tags: ["Voice", "Servers"],
    start({ cleanup }) {
        cleanup(command({
            name: "voicecount",
            description: tx("How many people are in each voice channel here"),
            run: (_, ctx) => {
                const guildId = ctx.channel.guild_id;
                if (!guildId) return botMessage(ctx.channel.id, t("Use it in a server."));
                const voice = getStore("VoiceStateStore");
                const lines = guildChannels(guildId, "VOCAL")
                    .map(c => ({ c, count: Object.keys(voice?.getVoiceStatesForChannel?.(c.id) ?? {}).length }))
                    .filter(x => x.count > 0)
                    .sort((a, b) => b.count - a.count)
                    .map(x => `🔊 <#${x.c.id}> · ${x.count}`);
                botMessage(ctx.channel.id, lines.length ? lines.join("\n") : t("Nobody is in a voice channel here."));
            },
        }));
    },
});

const ServerListIndicators = definePlugin({
    id: "endcord.server-list-indicators",
    name: "ServerListIndicators",
    description: tx("See how many of your friends are online and how many servers you're in with /indicators"),
    authors: [ENDCORD_AUTHOR],
    icon: "FriendsIcon",
    tags: ["Friends", "Servers"],
    start({ cleanup }) {
        cleanup(command({
            name: "indicators",
            description: tx("Your online friends and servers, counted"),
            run: (_, ctx) => {
                const friends: string[] = getStore("RelationshipStore")?.getFriendIDs?.() ?? [];
                const presence = getStore("PresenceStore");
                const online = friends.filter(id => (presence?.getStatus?.(id) ?? "offline") !== "offline").length;
                const guilds = getStore("GuildStore");
                const servers = guilds?.getGuildCount?.() ?? Object.keys(guilds?.getGuilds?.() ?? {}).length;
                botMessage(ctx.channel.id, t("{online} of your {friends} friends are online · you're in {servers} servers", { online, friends: friends.length, servers }));
            },
        }));
    },
});

// ImplicitRelationships ------------------------------------------------------------------------------------------------

const ImplicitRelationships = definePlugin({
    id: "endcord.implicit-relationships",
    name: "ImplicitRelationships",
    description: tx("See the people Discord thinks you talk to most, even if they aren't your friends, with /implicit"),
    authors: [ENDCORD_AUTHOR],
    icon: "FriendsIcon",
    tags: ["Friends"],
    start({ cleanup }) {
        cleanup(command({
            name: "implicit",
            description: tx("People you talk to a lot who aren't your friends"),
            run: (_, ctx) => {
                const affinities: any[] = getStore("UserAffinitiesStore")?.getUserAffinities?.() ?? [];
                const relationships = getStore("RelationshipStore");
                const me = currentUserId();
                const ids = affinities
                    .map(a => String(a?.user_id ?? a?.otherUserId ?? a?.userId ?? ""))
                    .filter(id => id && id !== me && !relationships?.isFriend?.(id))
                    .slice(0, 25);
                botMessage(ctx.channel.id, ids.length ? ids.map((id, i) => `${i + 1}. <@${id}>`).join("\n") : t("Discord hasn't told the app about anyone yet."));
            },
        }));
    },
});

// QuickThemeSwitcher ---------------------------------------------------------------------------------------------------

function pickTheme() {
    const installed = Object.values(themes);
    const current = getCurrentTheme()?.id;
    choose(t("Theme"), [
        { label: `${current ? "" : "✓ "}${t("Default")}`, value: "" },
        ...installed.map(theme => ({ label: `${theme.id === current ? "✓ " : ""}${theme.data?.name ?? theme.id}`, value: theme.id })),
    ], id => {
        Promise.resolve(selectTheme(id ? themes[id] : null)).catch(failed);
        showToast(t("Theme changed; some colors change after a restart"), findAssetId("PaintPaletteIcon"));
    });
}

const QuickThemeSwitcher = definePlugin({
    id: "endcord.quick-theme-switcher",
    name: "QuickThemeSwitcher",
    description: tx("Switch between your installed themes with /theme or a button beside the message box"),
    authors: [ENDCORD_AUTHOR],
    icon: "PaintPaletteIcon",
    tags: ["Appearance"],
    settings: {
        button: { type: "select", label: tx("Chat bar button"), default: "none", options: BUTTON_OPTIONS },
    },
    async start({ store, cleanup }) {
        await awaitStorage(themes);
        cleanup(
            command({ name: "theme", description: tx("Switch to another installed theme"), run: pickTheme }),
            chatButton("quick-theme-switcher", store, "PaintPaletteIcon", () => t("Theme"), pickTheme),
        );
    },
});

// StreamProof ----------------------------------------------------------------------------------------------------------

const StreamProof = definePlugin({
    id: "endcord.stream-proof",
    name: "StreamProof",
    description: tx("Hides messages and their images while you share your screen or record it. Toggle via chat bar button."),
    authors: [ENDCORD_AUTHOR],
    icon: "EyeSlashIcon",
    tags: ["Privacy"],
    settings: {
        button: { type: "select", label: tx("Chat bar button"), default: "right", options: BUTTON_OPTIONS },
    },
    start({ store, cleanup }) {
        let on = false;
        const toggle = () => {
            on = !on;
            redrawChannel();
            showToast(on ? t("Messages are hidden") : t("Messages are shown again"), findAssetId(on ? "EyeSlashIcon" : "EyeIcon"));
        };
        cleanup(
            onMessageRow("stream-proof", row => {
                if (!on) return;
                if (Array.isArray(row.content)) row.content = [textNode("••••••")];
                for (const key of ["attachments", "embeds", "stickers", "gifts", "codedLinks"]) if (Array.isArray(row[key])) row[key] = [];
            }, RowOrder.HIDE),
            command({ name: "streamproof", description: tx("Hide or show messages"), run: toggle }),
            chatButton("stream-proof", store, "EyeSlashIcon", () => t("StreamProof"), toggle),
        );
    },
});

// EndcordToolbox -------------------------------------------------------------------------------------------------------

function toolbox() {
    // Other plugins' entries, such as CustomProfile's
    const extra = getToolboxActions();
    choose(t("Endcord Toolbox"), [
        { label: t("Reload Discord"), value: "reload", icon: "RetryIcon" },
        { label: t("Turn Off a Plugin…"), value: "plugins", icon: "PuzzlePieceIcon" },
        { label: t("Copy Debug Info"), value: "debug", icon: "CopyIcon" },
        ...extra.map((a, i) => ({ label: a.label(), value: `extra-${i}`, icon: a.icon })),
        { label: t("Restart in Safe Mode"), value: "safe", icon: "ShieldIcon", danger: true },
    ], action => {
        if (action.startsWith("extra-")) {
            const result = extra[Number(action.slice("extra-".length))]?.run();
            if (result instanceof Promise) result.catch(failed);
        } else if (action === "reload") BundleUpdaterManager.reload();
        else if (action === "safe") toggleSafeMode({ to: true });
        else if (action === "debug") {
            const info = getDebugInfo() as any;
            const enabled = manifest.filter(p => isPluginEnabled(p.id)).length;
            copy([
                `Endcord ${info.bunny?.version ?? "?"}`,
                `Discord ${info.discord?.version ?? "?"} (${info.discord?.build ?? "?"})`,
                `${info.os?.name ?? "Android"} ${info.os?.version ?? ""} · ${info.device?.manufacturer ?? ""} ${info.device?.model ?? ""}`.trim(),
                `Hermes ${info.hermes?.version ?? "?"}`,
                `${t("Plugins on")}: ${enabled}`,
            ].join("\n"));
        } else {
            const on = manifest.filter(p => isPluginEnabled(p.id));
            if (!on.length) return showToast(t("No Endcord plugins are on"), findAssetId("PuzzlePieceIcon"));
            choose(t("Turn Off a Plugin…"), on.map(p => ({ label: p.name, value: p.id })), id => {
                disablePlugin(id);
                showToast(t("{plugin} is off", { plugin: manifest.find(p => p.id === id)?.name ?? id }), findAssetId("PuzzlePieceIcon"));
            });
        }
    });
}

const EndcordToolbox = definePlugin({
    id: "endcord.endcord-toolbox",
    name: "EndcordToolbox",
    description: tx("Adds a button beside the message box with Endcord quick actions: reload, turn off plugins, debug info and safe mode"),
    authors: [ENDCORD_AUTHOR],
    icon: "WrenchIcon",
    tags: ["Utility"],
    settings: {
        button: { type: "select", label: tx("Chat bar button"), default: "right", options: BUTTON_OPTIONS },
    },
    start({ store, cleanup }) {
        cleanup(
            command({ name: "toolbox", description: tx("Open Endcord's quick actions"), run: toolbox }),
            chatButton("endcord-toolbox", store, "WrenchIcon", () => t("Endcord Toolbox"), toolbox),
        );
    },
});

// IconViewer -----------------------------------------------------------------------------------------------------------

function IconsPage() {
    const [query, setQuery] = useState("");
    // Read once, when the page opens: every icon module is loaded for it
    const names = useMemo(() => [...new Set([...iterateAssets()].map(a => a?.name).filter((n): n is string => typeof n === "string"))].sort(), []);
    const q = query.trim().toLowerCase();
    const matches = (q ? names.filter(n => n.toLowerCase().includes(q)) : names).slice(0, 60);
    return <Stack spacing={8}>
        <TextInput isClearable placeholder={t("Search {count} icons", { count: names.length })} value={query} onChange={(v: string) => setQuery(v)} />
        <LogList
            title={t("Icons")}
            empty={t("No icon has that name")}
            entries={matches.map(name => ({ key: name, label: name, icon: name, onPress: () => copy(name) }))}
        />
    </Stack>;
}

const IconViewer = definePlugin({
    id: "endcord.icon-viewer",
    name: "IconViewer",
    description: tx("Browse and search all of Discord's icons in the plugin's settings, and copy their names"),
    authors: [ENDCORD_AUTHOR],
    icon: "ImageIcon",
    tags: ["Utility"],
    SettingsComponent: IconsPage,
    start() { },
});

// FakeConnections ------------------------------------------------------------------------------------------------------

const CONNECTION_TYPES = ["github", "twitch", "youtube", "steam", "spotify", "reddit", "twitter", "xbox", "playstation", "tiktok", "instagram", "battlenet", "epicgames", "riotgames", "roblox", "bluesky", "domain"];

const fakeConnections = wrapSync(createStorage<{ items: Array<{ type: string; name: string; }>; }>(createMMKVBackend("ENDCORD_FAKE_CONNECTIONS", { items: [] })));
const connectionList = () => Array.isArray(fakeConnections.items) ? fakeConnections.items : [];
let refreshConnections: (() => void) | undefined;

function ConnectionsPage() {
    useProxy(fakeConnections);
    return <Stack spacing={8}>
        <LogList
            title={t("Fake connections")}
            empty={t("None yet")}
            entries={connectionList().map((c, i) => ({
                key: `${c.type}:${c.name}:${i}`,
                label: c.name,
                subLabel: c.type,
                icon: "LinkIcon",
                onPress: () => choose(c.name, [{ label: t("Remove"), value: i, danger: true }], index => {
                    fakeConnections.items = connectionList().filter((_, j) => j !== index);
                    refreshConnections?.();
                }),
            }))}
        />
        <LogList
            title={t("Add")}
            empty=""
            entries={[{
                key: "add",
                label: t("Add a Connection…"),
                icon: "PlusSmallIcon",
                onPress: () => choose(t("Service"), CONNECTION_TYPES.map(type => ({ label: type, value: type })), type => prompt({
                    title: type,
                    placeholder: t("Name shown on your profile"),
                    onSubmit: name => {
                        if (!name.trim()) throw new Error(t("Enter a name"));
                        fakeConnections.items = [...connectionList(), { type, name: name.trim() }];
                        refreshConnections?.();
                    },
                })),
            }]}
        />
    </Stack>;
}

const FakeConnections = definePlugin({
    id: "endcord.fake-connections",
    name: "FakeConnections",
    description: tx("Add fake connections to your own profile, visible only to you."),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Customisation", "Fun"],
    SettingsComponent: ConnectionsPage,
    async start({ cleanup }) {
        await awaitStorage(fakeConnections);
        const store = getStore("UserProfileStore");
        const patch = rewriteResult(store, "getUserProfile", profile => {
            if (profile.userId !== currentUserId() || !connectionList().length) return profile;
            const fakes = connectionList().map((c, i) => ({ type: c.type, name: c.name, id: `endcord-${i}`, verified: true }));
            const accounts = [...profile.connectedAccounts ?? [], ...fakes];
            // A view of Discord's profile with more accounts; the profile itself, and its methods, stay as they are
            return new Proxy(profile, {
                get(target, key) {
                    if (key === "connectedAccounts") return accounts;
                    const value = Reflect.get(target, key, target);
                    return typeof value === "function" ? value.bind(target) : value;
                },
            });
        });
        if (!patch) throw new Error("Discord's profiles weren't found");
        refreshConnections = patch.refresh;
        cleanup(() => {
            refreshConnections = undefined;
            patch.unpatch();
            store?.emitChange?.();
        });
        patch.refresh();
    },
});

// WhosWatching / BetterInvites -----------------------------------------------------------------------------------------

const WhosWatching = definePlugin({
    id: "endcord.whos-watching",
    name: "WhosWatching",
    description: tx("See who is watching your stream with /viewers"),
    authors: [ENDCORD_AUTHOR],
    icon: "ScreenIcon",
    tags: ["Voice"],
    start({ cleanup }) {
        cleanup(command({
            name: "viewers",
            description: tx("Who is watching your stream"),
            run: (_, ctx) => {
                const streams = getStore("ApplicationStreamingStore");
                const stream = streams?.getCurrentUserActiveStream?.();
                if (!stream) return botMessage(ctx.channel.id, t("You aren't streaming."));
                const viewers: string[] = streams?.getViewerIds?.(stream) ?? [];
                botMessage(ctx.channel.id, viewers.length ? `👀 ${viewers.map(id => `<@${id}>`).join(", ")}` : t("Nobody is watching yet."));
            },
        }));
    },
});

const BetterInvites = definePlugin({
    id: "endcord.better-invites",
    name: "BetterInvites",
    description: tx("See where an invite leads, who made it and when it expires, before joining, with /inviteinfo"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Servers", "Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "inviteinfo",
            description: tx("Look at an invite without joining"),
            options: [{ name: "invite", description: tx("The invite link or code"), required: true }],
            run: async ({ invite }, ctx) => {
                const code = String(invite).trim().replace(/^(https?:\/\/)?(www\.)?(discord\.gg|discord(app)?\.com\/invite)\//, "").split(/[/?#]/)[0];
                const data = await api("get", `/invites/${encodeURIComponent(code)}?with_counts=true&with_expiration=true`);
                const lines = [
                    `**${data?.guild?.name ?? data?.channel?.name ?? code}**`,
                    data?.guild?.description,
                    data?.channel?.name ? `${t("Channel")}: #${data.channel.name}` : undefined,
                    data?.inviter ? `${t("Made by")}: ${data.inviter.global_name ?? data.inviter.username} (${data.inviter.username})` : undefined,
                    data?.approximate_member_count != null ? t("{members} members, {online} online", { members: data.approximate_member_count, online: data.approximate_presence_count ?? "?" }) : undefined,
                    `${t("Expires")}: ${data?.expires_at ? `<t:${Math.floor(Date.parse(data.expires_at) / 1000)}:R>` : t("never")}`,
                ].filter(Boolean);
                botMessage(ctx.channel.id, lines.join("\n"));
            },
        }));
    },
});

export default [
    ConsoleJanitor, OpenInApp, PinDMs, HideServers, ServerPinner, RecentChannelSwitcher, RecentDMSwitcher, UnreadCountBadge, VoiceCount,
    ServerListIndicators, ImplicitRelationships, QuickThemeSwitcher, StreamProof, EndcordToolbox, IconViewer, FakeConnections, WhosWatching,
    BetterInvites,
];
