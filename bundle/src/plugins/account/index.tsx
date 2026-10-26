/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Plugins about your account and the app itself: server tags, focus time, profile presets, startup timings, logs.
 */

import { t, tx } from "@core/i18n";
import { addOverlay } from "@core/overlay";
import { getTimings } from "@core/timings";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { NativeClientInfoModule } from "@lib/api/native/modules";
import { before } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { Button, Stack, TableRow, TableRowGroup, Text } from "@metro/common/components";
import { version } from "bunny-build-info";
import { View } from "react-native";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addChatButton, currentUserId, getChatInputActionButton, getStore, onAction, subscribe } from "../common";
import { api, command, describeError, displayName, generatedIcon, getChannel, getGuild, getUser, jumpTo } from "../hooks";
import { manifest } from "../manifest";
import { choose, prompt } from "../ui/dialogs";
import LogList from "../ui/LogList";

const ids = (text: string) => text.split(/[\s,]+/).filter(Boolean);
const preview = (text: string, length = 80) => {
    const flat = (text ?? "").replace(/\s+/g, " ").trim();
    return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};

// ClanSwitcher ---------------------------------------------------------------------------------------------------------

const ClanSwitcher = definePlugin({
    id: "endcord.clan-switcher",
    name: "ClanSwitcher",
    description: tx("Automatically switches your Discord server tag"),
    authors: [ENDCORD_AUTHOR],
    icon: "TagIcon",
    tags: ["Customisation", "Fun"],
    settings: {
        clans: { type: "string", label: tx("Servers"), description: tx("IDs of the servers whose tags to rotate, separated by commas"), default: "" },
        intervalSeconds: { type: "number", label: tx("Every (seconds)"), description: tx("How often the tag changes; Discord limits how fast it can"), default: 120, min: 60, max: 86400 },
    },
    start({ store, cleanup, logger }) {
        let index = 0;
        const next = () => {
            const clans = ids(store.clans);
            if (!clans.length) return;
            const guildId = clans[index++ % clans.length];
            api("put", "/users/@me/clan", { identity_guild_id: guildId, identity_enabled: true }).catch(e => logger.warn("Couldn't switch the server tag", e));
        };
        let timer = setInterval(next, store.intervalSeconds * 1000);
        let interval = store.intervalSeconds;
        // The interval applies without restarting the plugin
        const watch = setInterval(() => {
            if (interval === store.intervalSeconds) return;
            interval = store.intervalSeconds;
            clearInterval(timer);
            timer = setInterval(next, interval * 1000);
        }, 5000);
        cleanup(() => clearInterval(timer), () => clearInterval(watch));
    },
});

// FocusMode ------------------------------------------------------------------------------------------------------------

const statusSetting = () => findByProps("StatusSetting", "CustomStatusSetting")?.StatusSetting ?? findByProps("StatusSetting")?.StatusSetting;

const FocusMode = definePlugin({
    id: "endcord.focus-mode",
    name: "FocusMode",
    description: tx("One switch for Do Not Disturb, for a while or until you turn it off, and back to your previous status when it ends"),
    authors: [ENDCORD_AUTHOR],
    icon: "BellZIcon",
    tags: ["Notifications", "Utility"],
    settings: {
        status: {
            type: "select",
            label: tx("Status while Focus Mode is on"),
            default: "dnd",
            options: [{ label: tx("Do Not Disturb"), value: "dnd" }, { label: tx("Idle"), value: "idle" }, { label: tx("Invisible"), value: "invisible" }],
        },
        button: {
            type: "select",
            label: tx("Chat bar button"),
            default: "none",
            options: [
                { label: tx("Hidden"), value: "none" },
                { label: tx("Left of the message box"), value: "left" },
                { label: tx("Right of the message box"), value: "right" },
            ],
        },
    },
    start({ store, cleanup }) {
        let previous: string | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const on = () => previous !== undefined;
        const end = () => {
            clearTimeout(timer);
            if (previous === undefined) return;
            statusSetting()?.updateSetting?.(previous);
            previous = undefined;
            showToast(t("Focus Mode is off"), findAssetId("BellZIcon"));
        };
        const begin = (minutes?: number) => {
            if (!on()) previous = getStore("PresenceStore")?.getStatus?.(currentUserId()) ?? "online";
            statusSetting()?.updateSetting?.(store.status);
            clearTimeout(timer);
            if (minutes) timer = setTimeout(end, minutes * 60_000);
            showToast(minutes ? t("Focus Mode is on for {minutes} minutes", { minutes }) : t("Focus Mode is on"), findAssetId("BellZIcon"));
        };
        const toggle = () => on() ? end() : choose(t("Focus Mode"), [
            { label: t("For 30 minutes"), value: 30 }, { label: t("For 1 hour"), value: 60 },
            { label: t("For 2 hours"), value: 120 }, { label: t("Until I turn it off"), value: 0 },
        ], minutes => begin(minutes || undefined));
        cleanup(
            end,
            command({
                name: "focus",
                description: tx("Turn Focus Mode on or off"),
                options: [{ name: "minutes", description: tx("How long; leave it out to keep it on until you turn it off"), type: "integer" }],
                run: ({ minutes }) => {
                    if (on() && minutes == null) end();
                    else begin(minutes ? Number(minutes) : undefined);
                },
            }),
            addChatButton({
                key: "focus-mode",
                side: () => store.button as "left" | "right" | "none",
                render: () => {
                    const Button = getChatInputActionButton();
                    const Icon = generatedIcon("BellZIcon");
                    return Button && Icon ? <Button accessibilityLabel={t("Focus Mode")} IconComponent={Icon} onPress={toggle} /> : null;
                },
            }),
        );
    },
});

// ProfileSets ----------------------------------------------------------------------------------------------------------

interface ProfilePreset {
    name: string;
    globalName?: string;
    bio?: string;
    pronouns?: string;
}

const presets = wrapSync(createStorage<{ items: ProfilePreset[]; }>(createMMKVBackend("ENDCORD_PROFILE_SETS", { items: [] })));
const presetList = () => Array.isArray(presets.items) ? presets.items : [];

async function applyProfile(preset: ProfilePreset) {
    await api("patch", "/users/@me/profile", { bio: preset.bio ?? "", pronouns: preset.pronouns ?? "" });
    if (preset.globalName !== undefined) await api("patch", "/users/@me", { global_name: preset.globalName || null });
}

function ProfileSetsPage() {
    useProxy(presets);
    const save = () => prompt({
        title: t("Save Current Profile"),
        placeholder: t("Preset name"),
        onSubmit: name => {
            const me = currentUserId();
            const profile = me ? getStore("UserProfileStore")?.getUserProfile?.(me) : undefined;
            const user = me ? getUser(me) : undefined;
            presets.items = [...presetList(), { name: name.trim(), globalName: user?.globalName ?? "", bio: profile?.bio ?? "", pronouns: profile?.pronouns ?? "" }];
        },
    });
    return <Stack spacing={8}>
        <LogList
            title={t("Profile Presets")}
            empty={t("Save your display name, About Me and pronouns to switch back to them in one tap")}
            entries={presetList().map((p, i) => ({
                key: String(i),
                label: p.name,
                subLabel: preview([p.globalName, p.pronouns, p.bio].filter(Boolean).join(" · "), 90),
                onPress: () => choose(p.name, [
                    { label: t("Apply"), value: "apply", icon: "CheckmarkLargeIcon" },
                    { label: t("Delete"), value: "delete", icon: "TrashIcon", danger: true },
                ], action => {
                    if (action === "delete") presets.items = presetList().filter((_, j) => j !== i);
                    else applyProfile(p)
                        .then(() => showToast(t("Profile updated"), findAssetId("CheckmarkLargeIcon")))
                        .catch(e => showToast(t("Request failed: {error}", { error: describeError(e) }), findAssetId("CircleXIcon-primary")));
                }),
            }))}
        />
        <Button text={t("Save Current Profile")} variant="secondary" icon={findAssetId("PlusSmallIcon")} onPress={save} />
    </Stack>;
}

const ProfileSets = definePlugin({
    id: "endcord.profile-sets",
    name: "ProfileSets",
    description: tx("Allows you to save and load different profile presets."),
    authors: [ENDCORD_AUTHOR],
    icon: "UserCircleIcon",
    tags: ["Customisation"],
    SettingsComponent: ProfileSetsPage,
    async start() {
        await awaitStorage(presets);
    },
});

// StartupTimings -------------------------------------------------------------------------------------------------------

function TimingsPage() {
    const timings = getTimings();
    const names = Object.fromEntries(manifest.map(p => [p.id, p.name]));
    const plugins = Object.entries(timings.plugins).sort((a, b) => b[1] - a[1]);
    const total = plugins.reduce((n, [, ms]) => n + ms, 0);
    return <Stack spacing={12}>
        <TableRowGroup title={t("Endcord")}>
            <TableRow label={t("Endcord's own startup")} trailing={<TableRow.TrailingText text={timings.ready ? `${timings.ready - timings.loaded} ms` : "…"} />} />
            <TableRow label={t("Plugins started")} subLabel={t("{count} plugins", { count: plugins.length })} trailing={<TableRow.TrailingText text={`${total} ms`} />} />
        </TableRowGroup>
        {plugins.length > 0 && <TableRowGroup title={t("Plugins")}>
            {plugins.map(([id, ms]) => <TableRow key={id} label={names[id] ?? id} trailing={<TableRow.TrailingText text={`${ms} ms`} />} />)}
        </TableRowGroup>}
        <Text variant="text-xs/medium" color="text-muted">{t("Plugins load in the background, so a slow one doesn't hold Discord up. Only the plugins you turn on are loaded.")}</Text>
    </Stack>;
}

const StartupTimings = definePlugin({
    id: "endcord.startup-timings",
    name: "StartupTimings",
    description: tx("Shows how long Endcord and each of its plugins took to start, in the plugin's settings"),
    authors: [ENDCORD_AUTHOR],
    icon: "TimerIcon",
    tags: ["Utility"],
    SettingsComponent: TimingsPage,
    start() { },
});

// DiscordDevBanner -----------------------------------------------------------------------------------------------------

function Banner() {
    const info = NativeClientInfoModule.getConstants();
    return <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" }}>
        <View style={{ backgroundColor: "rgba(88,101,242,0.85)", paddingHorizontal: 8, paddingVertical: 1, borderBottomLeftRadius: 6, borderBottomRightRadius: 6 }}>
            <Text variant="text-xxs/semibold" style={{ color: "white" }}>Discord {info.Version} ({info.Build}) · Endcord {version.split("-")[0]}</Text>
        </View>
    </View>;
}

const DiscordDevBanner = definePlugin({
    id: "endcord.discord-dev-banner",
    name: "DiscordDevBanner",
    description: tx("Enables Discord's developer banner, which shows the build ID"),
    authors: [ENDCORD_AUTHOR],
    icon: "WrenchIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(addOverlay("discord-dev-banner", Banner));
    },
});

// Declutter ------------------------------------------------------------------------------------------------------------

const Declutter = definePlugin({
    id: "endcord.declutter",
    name: "Declutter",
    description: tx("Cleans up Discord by removing profile effects and avatar decorations"),
    authors: [ENDCORD_AUTHOR],
    icon: "TrashIcon",
    tags: ["Appearance"],
    settings: {
        removeProfileEffect: { type: "boolean", label: tx("Profile effects"), description: tx("Remove profile animations"), default: true },
        removeAvatarDecorations: { type: "boolean", label: tx("Avatar decorations"), description: tx("Remove avatar decorations"), default: true },
    },
    start({ store, cleanup }) {
        cleanup(onAction<{ user_profile?: any; guild_member_profile?: any; }>("USER_PROFILE_FETCH_SUCCESS", payload => {
            if (!store.removeProfileEffect) return;
            const strip = (p: any) => p && { ...p, profile_effect: null };
            return { user_profile: strip(payload.user_profile), guild_member_profile: strip(payload.guild_member_profile) };
        }));
        const images = findByProps("getAvatarDecorationURL");
        if (typeof images?.getAvatarDecorationURL === "function") {
            cleanup(before("getAvatarDecorationURL", images, (args: any[]) => {
                if (store.removeAvatarDecorations && args[0]) args[0] = { ...args[0], avatarDecoration: null };
            }));
        }
    },
});

// EventLogs ------------------------------------------------------------------------------------------------------------

interface LogEvent {
    at: number;
    kind: "deleted" | "edited" | "friend" | "server";
    text: string;
    channelId?: string;
    messageId?: string;
}

const events = wrapSync(createStorage<{ items: LogEvent[]; }>(createMMKVBackend("ENDCORD_EVENT_LOGS", { items: [] })));
const ICONS: Record<LogEvent["kind"], string> = { deleted: "TrashIcon", edited: "PencilIcon", friend: "FriendsIcon", server: "ServerIcon" };

function EventLogsPage() {
    useProxy(events);
    const items = Array.isArray(events.items) ? events.items : [];
    return <LogList
        title={t("Event Logs")}
        empty={t("Deleted and edited messages, friends and servers will be logged here")}
        entries={items.map((e, i) => ({
            key: `${e.at}-${i}`,
            label: e.text,
            subLabel: new Date(e.at).toLocaleString(),
            icon: ICONS[e.kind],
            onPress: e.channelId && e.messageId ? () => jumpTo(e.channelId!, e.messageId!) : undefined,
        }))}
        onClear={() => void (events.items = [])}
    />;
}

const EventLogs = definePlugin({
    id: "endcord.event-logs",
    name: "EventLogs",
    description: tx("Keeps a log of deleted and edited messages, friends added and removed, and servers you join and leave"),
    authors: [ENDCORD_AUTHOR],
    icon: "BookCheckIcon",
    tags: ["Utility"],
    settings: {
        keep: { type: "number", label: tx("Events to keep"), description: tx("Older events are removed"), default: 200, min: 20, max: 2000 },
        messages: { type: "boolean", label: tx("Messages"), description: tx("Log deleted and edited messages"), default: true },
        friends: { type: "boolean", label: tx("Friends"), description: tx("Log friends added and removed"), default: true },
        servers: { type: "boolean", label: tx("Servers"), description: tx("Log servers you join and leave"), default: true },
    },
    SettingsComponent: EventLogsPage,
    async start({ store, cleanup }) {
        await awaitStorage(events);
        // Batched, so a burst of deletes is one write
        let pending: LogEvent[] = [];
        let timer: ReturnType<typeof setTimeout> | undefined;
        const add = (e: Omit<LogEvent, "at">) => {
            pending.push({ ...e, at: Date.now() });
            timer ??= setTimeout(() => {
                timer = undefined;
                events.items = [...pending.reverse(), ...(events.items ?? [])].slice(0, store.keep);
                pending = [];
            }, 1000);
        };
        const message = (channelId: string, id: string) => getStore("MessageStore")?.getMessage?.(channelId, id);
        const where = (channelId: string) => {
            const channel = getChannel(channelId);
            return channel?.guild_id ? `#${channel.name}` : t("Direct Message");
        };
        cleanup(
            () => clearTimeout(timer),
            onAction<{ id: string; channelId: string; endcordLocal?: boolean; }>("MESSAGE_DELETE", ({ id, channelId, endcordLocal }) => {
                const m = !endcordLocal && store.messages ? message(channelId, id) : undefined;
                if (m?.content) add({ kind: "deleted", text: `${t("Deleted")} · ${displayName(m.author)} · ${where(channelId)}: ${preview(m.content)}`, channelId, messageId: id });
            }, { first: true }),
            onAction<{ message?: any; }>("MESSAGE_UPDATE", ({ message: update }) => {
                if (!store.messages || update?.content === undefined) return;
                const m = message(update.channel_id, update.id);
                if (m?.content && m.content !== update.content) add({ kind: "edited", text: `${t("Edited")} · ${displayName(m.author)} · ${where(update.channel_id)}: ${preview(m.content)} → ${preview(update.content)}`, channelId: update.channel_id, messageId: update.id });
            }, { first: true }),
            subscribe("RELATIONSHIP_ADD", ({ relationship }) => {
                if (store.friends && relationship?.type === 1) add({ kind: "friend", text: t("{user} is now your friend", { user: displayName(relationship.user ?? getUser(relationship.id)) }) });
            }),
            subscribe("RELATIONSHIP_REMOVE", ({ relationship }) => {
                if (store.friends && relationship?.type === 1) add({ kind: "friend", text: t("{user} is no longer your friend", { user: displayName(getUser(relationship.id) ?? { id: relationship.id }) }) });
            }),
            onAction<{ guild?: { id: string; unavailable?: boolean; }; }>("GUILD_DELETE", ({ guild }) => {
                if (store.servers && guild && !guild.unavailable) add({ kind: "server", text: t("You left {server}", { server: getGuild(guild.id)?.name ?? guild.id }) });
            }, { first: true }),
            subscribe("GUILD_CREATE", ({ guild }) => {
                const joined = Date.parse(guild?.joined_at ?? guild?.joinedAt ?? "");
                if (store.servers && Date.now() - joined < 60_000) add({ kind: "server", text: t("You joined {server}", { server: guild.name }) });
            }),
        );
    },
});

export default [ClanSwitcher, FocusMode, ProfileSets, StartupTimings, DiscordDevBanner, Declutter, EventLogs];
