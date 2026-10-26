/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Plugins about the people you talk to: who they are, what they can do, when they were last around.
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { useEffect, useState } from "react";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore, subscribe } from "../common";
import { addMessageAction, api, botMessage, command, copy, currentChannelId, displayName, getChannel, getGuild, getUser, onMessageRow, redrawMessage, textNode } from "../hooks";
import { translate } from "../lookup";
import { choose, prompt, showText } from "../ui/dialogs";
import LogList from "../ui/LogList";

const preview = (text: string, length = 90) => {
    const flat = (text ?? "").replace(/\s+/g, " ").trim();
    return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};

interface Remembered {
    id: string;
    username: string;
    name: string;
    lastSeen: number;
    where: string;
}

const people = wrapSync(createStorage<{ users: Record<string, Remembered>; }>(createMMKVBackend("ENDCORD_I_REMEMBER_YOU", { users: {} })));

function PeopleList() {
    useProxy(people);
    const users = Object.values(people.users ?? {}).sort((a, b) => b.lastSeen - a.lastSeen);
    return <LogList
        title={t("People You've Talked To")}
        empty={t("People you message and who message you will be listed here")}
        entries={users.slice(0, 300).map(u => ({
            key: u.id,
            label: `${u.name} (@${u.username})`,
            subLabel: `${u.where} · ${new Date(u.lastSeen).toLocaleDateString()}`,
            onPress: () => copy(u.id, t("User ID copied")),
        }))}
        onClear={() => void (people.users = {})}
    />;
}

const IRememberYou = definePlugin({
    id: "endcord.i-remember-you",
    name: "IRememberYou",
    description: tx("Locally saves everyone you've been communicating with (including servers), in case of lose"),
    authors: [ENDCORD_AUTHOR],
    icon: "FriendsIcon",
    tags: ["Friends", "Utility"],
    SettingsComponent: PeopleList,
    async start({ cleanup }) {
        await awaitStorage(people);
        const remember = (user: any, channelId: string) => {
            if (!user?.id || user.bot || user.id === currentUserId()) return;
            const channel = getChannel(channelId);
            const where = channel?.guild_id ? getGuild(channel.guild_id)?.name ?? t("A server") : t("Direct Message");
            people.users = { ...(people.users ?? {}), [user.id]: { id: user.id, username: user.username, name: displayName(user), lastSeen: Date.now(), where } };
        };
        cleanup(subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
            if (optimistic || !message?.author) return;
            const me = currentUserId();
            const channel = getChannel(message.channel_id);
            const isDm = channel && !channel.guild_id;
            // People in DMs, and people in servers who reply to you or mention you
            const toMe = message.referenced_message?.author?.id === me || (message.mentions ?? []).some((u: any) => (u?.id ?? u) === me);
            if (message.author.id === me) {
                if (isDm) for (const id of channel.recipients ?? []) remember(getUser(id), message.channel_id);
                else if (message.referenced_message?.author) remember(message.referenced_message.author, message.channel_id);
            } else if (isDm || toMe) {
                remember(message.author, message.channel_id);
            }
        }));
    },
});

/** The names of the permissions in a bitfield, from Discord's own table */
function permissionNames(bits: unknown): string[] {
    const table = findByProps("Permissions", "ChannelTypes")?.Permissions ?? {};
    const names: string[] = [];
    for (const [name, value] of Object.entries<any>(table)) {
        try {
            if (value && ((bits as any) & value) === value) names.push(name);
        } catch {
            // Mixed number and BigInt bitfields can't be compared
        }
    }
    return names;
}

const title = (name: string) => name.toLowerCase().split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");

const PermissionsViewer = definePlugin({
    id: "endcord.permissions-viewer",
    name: "PermissionsViewer",
    description: tx("View the permissions a user or channel has, and the roles of a server"),
    authors: [ENDCORD_AUTHOR],
    icon: "ShieldIcon",
    tags: ["Servers", "Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "permissions-viewer",
            icon: "ShieldIcon",
            label: () => t("View Roles and Permissions"),
            visible: (message, channel) => !!channel?.guild_id && !!message.author?.id,
            onPress: (message, channel) => {
                const guildId = channel.guild_id;
                const guild = getGuild(guildId);
                const member = getStore("GuildMemberStore")?.getMember?.(guildId, message.author.id);
                const roles = getStore("GuildRoleStore")?.getRoles?.(guildId) ?? guild?.roles ?? {};
                const memberRoles = [roles[guildId], ...(member?.roles ?? []).map((id: string) => roles[id])].filter(Boolean).sort((a: any, b: any) => b.position - a.position);
                const owner = guild?.ownerId === message.author.id;
                let bits: any = memberRoles[0]?.permissions;
                for (const role of memberRoles.slice(1)) {
                    try {
                        bits |= role.permissions;
                    } catch { }
                }
                const permissions = permissionNames(bits);
                const isAdmin = owner || permissions.includes("ADMINISTRATOR");
                showText(displayName(message.author), [
                    owner ? `👑 ${t("Server owner")}` : "",
                    `${t("Roles")}: ${memberRoles.map((r: any) => r.name).join(", ") || "—"}`,
                    "",
                    isAdmin ? t("Administrator: every permission") : `${t("Permissions")}:\n${permissions.map(p => `• ${title(p)}`).join("\n") || "—"}`,
                ].filter((line, i) => line || i === 2).join("\n"));
            },
        }));
    },
});

/** An image as a data URL, which Discord's upload endpoints take */
async function dataUrl(url: string): Promise<string> {
    const blob = await fetch(url).then(r => r.blob());
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

const ExpressionCloner = definePlugin({
    id: "endcord.expression-cloner",
    name: "ExpressionCloner",
    description: tx("Allows you to clone Emotes & Stickers to your own server (right click them)"),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Emotes", "Servers"],
    start({ cleanup }) {
        const emojis = (message: any) => [...new Set<string>(message.content?.match(/<a?:\w+:\d+>/g) ?? [])];
        const myServers = () => {
            const permissions = findByProps("Permissions", "ChannelTypes")?.Permissions;
            const manage = permissions?.MANAGE_GUILD_EXPRESSIONS ?? permissions?.MANAGE_EMOJIS_AND_STICKERS;
            return Object.values<any>(getStore("GuildStore")?.getGuilds?.() ?? {})
                .filter(g => g.ownerId === currentUserId() || manage && getStore("PermissionStore")?.can?.(manage, g));
        };
        cleanup(addMessageAction({
            key: "expression-cloner",
            icon: "ReactionIcon",
            label: () => t("Clone Emoji"),
            visible: message => emojis(message).length > 0,
            onPress: message => {
                const list = emojis(message);
                const pickServer = (emoji: string) => {
                    const servers = myServers();
                    if (!servers.length) {
                        showToast(t("You can't add emojis to any of your servers"), findAssetId("CircleXIcon-primary"));
                        return;
                    }
                    choose(t("Clone to which server?"), servers.map(g => ({ label: g.name, value: g.id })), async guildId => {
                        const [, animated, name, id] = emoji.match(/<(a?):(\w+):(\d+)>/)!;
                        try {
                            const image = await dataUrl(`https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}`);
                            await api("post", `/guilds/${guildId}/emojis`, { name, image });
                            showToast(t("Added :{name}: to {server}", { name, server: getGuild(guildId)?.name ?? "" }), findAssetId("CheckmarkLargeIcon"));
                        } catch (e: any) {
                            showToast(t("Couldn't clone the emoji: {error}", { error: e?.body?.message ?? e?.message ?? String(e) }), findAssetId("CircleXIcon-primary"));
                        }
                    });
                };
                if (list.length === 1) pickServer(list[0]);
                else choose(t("Clone Emoji"), list.map(e => ({ label: e.replace(/^<a?:(\w+):\d+>$/, ":$1:"), value: e })), pickServer);
            },
        }));
    },
});

const lastOnline = wrapSync(createStorage<{ users: Record<string, number>; }>(createMMKVBackend("ENDCORD_LAST_ONLINE", { users: {} })));

function lastSeenText(userId: string): string {
    const status = getStore("PresenceStore")?.getStatus?.(userId);
    if (status && status !== "offline") return t("Online now");
    const at = lastOnline.users?.[userId];
    return at ? t("Last online {time}", { time: new Date(at).toLocaleString() }) : t("Not seen online since Endcord started watching");
}

const LastOnline = definePlugin({
    id: "endcord.last-online",
    name: "LastOnline",
    description: tx("Adds a last online indicator under usernames in your DM list"),
    authors: [ENDCORD_AUTHOR],
    icon: "ClockIcon",
    tags: ["Friends"],
    async start({ cleanup }) {
        await awaitStorage(lastOnline);
        cleanup(
            subscribe("PRESENCE_UPDATES", ({ updates }) => {
                const changes: Record<string, number> = {};
                for (const update of updates ?? []) {
                    const id = update.user?.id;
                    if (id && update.status === "offline" && getStore("RelationshipStore")?.isFriend?.(id)) changes[id] = Date.now();
                }
                if (Object.keys(changes).length) lastOnline.users = { ...(lastOnline.users ?? {}), ...changes };
            }),
            addMessageAction({
                key: "last-online",
                icon: "ClockIcon",
                label: message => lastSeenText(message.author?.id),
                visible: message => !!message.author?.id && message.author.id !== currentUserId() && !message.author.bot,
                onPress: () => { },
            }),
            command({
                name: "lastonline",
                description: tx("When was someone last online"),
                options: [{ name: "user", description: tx("Who"), type: "user", required: true }],
                run: ({ user }, ctx) => void botMessage(ctx.channel.id, `<@${user}>: ${lastSeenText(user)}`),
            }),
        );
    },
});

const PingNotifications = definePlugin({
    id: "endcord.ping-notifications",
    name: "PingNotifications",
    description: tx("Customizable notifications with improved mention formatting"),
    authors: [ENDCORD_AUTHOR],
    icon: "AtIcon",
    tags: ["Notifications"],
    settings: {
        mentions: { type: "boolean", label: tx("Mentions"), description: tx("Notify when someone @mentions you directly"), default: true },
        roles: { type: "boolean", label: tx("Role mentions"), description: tx("Notify when one of your roles is mentioned"), default: true },
        everyone: { type: "boolean", label: tx("@everyone and @here"), description: tx("Notify for @everyone and @here"), default: false },
        friends: { type: "boolean", label: tx("Friends"), description: tx("Notify when friends send messages in servers"), default: false },
        showInActive: { type: "boolean", label: tx("In the open chat too"), description: tx("Show notifications even for currently active channel"), default: false },
    },
    start({ store, cleanup }) {
        cleanup(subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
            const me = currentUserId();
            if (optimistic || !message?.author || message.author.id === me) return;
            if (!store.showInActive && message.channel_id === currentChannelId()) return;
            const channel = getChannel(message.channel_id);
            if (!channel?.guild_id) return;
            const member = getStore("GuildMemberStore")?.getMember?.(channel.guild_id, me);
            const mentioned = (message.mentions ?? []).some((u: any) => (u?.id ?? u) === me);
            const roleMentioned = (message.mention_roles ?? []).some((id: string) => member?.roles?.includes(id));
            const reason = store.mentions && mentioned ? "mention"
                : store.roles && roleMentioned ? "role"
                    : store.everyone && message.mention_everyone ? "everyone"
                        : store.friends && getStore("RelationshipStore")?.isFriend?.(message.author.id) ? "friend" : undefined;
            if (!reason) return;
            // Mentions shown as names, not as <@id>
            const content = String(message.content ?? "")
                .replace(/<@!?(\d+)>/g, (_, id) => `@${displayName(getUser(id) ?? { id })}`)
                .replace(/<@&(\d+)>/g, (_, id) => `@${getStore("GuildRoleStore")?.getRole?.(channel.guild_id, id)?.name ?? t("role")}`)
                .replace(/<#(\d+)>/g, (_, id) => `#${getChannel(id)?.name ?? "?"}`)
                .replace(/<a?:(\w+):\d+>/g, ":$1:");
            showToast(`${displayName(message.author)} · #${channel.name}: ${preview(content, 90)}`, findAssetId(reason === "friend" ? "FriendsIcon" : "AtIcon"));
        }));
    },
});

const ReviewDB = definePlugin({
    id: "endcord.review-db",
    name: "ReviewDB",
    description: tx("Review other users (Adds a new settings to profiles)"),
    authors: [ENDCORD_AUTHOR],
    icon: "StarIcon",
    tags: ["Friends", "Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "review-db",
            icon: "StarIcon",
            label: () => t("View Reviews"),
            visible: message => !!message.author?.id && !message.author.bot,
            onPress: async message => {
                try {
                    const data = await fetch(`https://manti.vendicated.dev/api/reviewdb/users/${message.author.id}/reviews?flags=0&offset=0`).then(r => r.json());
                    const reviews: any[] = (data?.reviews ?? []).filter((r: any) => r?.comment && r.type !== 3);
                    showText(t("Reviews of {user}", { user: displayName(message.author) }), reviews.length
                        ? reviews.slice(0, 50).map(r => `${r.sender?.username ?? "?"} · ${new Date(r.timestamp * 1000).toLocaleDateString()}\n${r.comment}`).join("\n\n")
                        : t("Nobody has reviewed this user yet."));
                } catch {
                    showToast(t("Couldn't reach ReviewDB"), findAssetId("CircleXIcon-primary"));
                }
            },
        }));
    },
});

const CopyStatusUrls = definePlugin({
    id: "endcord.copy-status-urls",
    name: "CopyStatusUrls",
    description: tx("Copy a user's status URL when you right-click it"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        const urls = (userId: string): string[] => {
            const activities: any[] = getStore("PresenceStore")?.getActivities?.(userId) ?? [];
            return activities.flatMap(a => [a.url, ...(String(a.state ?? "").match(/https?:\/\/\S+/g) ?? [])]).filter(Boolean);
        };
        cleanup(addMessageAction({
            key: "copy-status-urls",
            icon: "LinkIcon",
            label: () => t("Copy Status URL"),
            visible: message => urls(message.author?.id).length > 0,
            onPress: message => {
                const list = urls(message.author.id);
                if (list.length === 1) copy(list[0]);
                else choose(t("Copy Status URL"), list.map(u => ({ label: u, value: u })), u => copy(u));
            },
        }));
    },
});

interface AutoTranslation {
    text: string;
    from: string;
}

const MessageTranslate = definePlugin({
    id: "endcord.message-translate",
    name: "MessageTranslate",
    description: tx("Auto translate messages to your language with caching, per-channel toggles, and more options."),
    authors: [ENDCORD_AUTHOR],
    icon: "LanguageIcon",
    tags: ["Chat"],
    settings: {
        targetLanguage: { type: "string", label: tx("Translate to"), description: tx("A language code like en, tr, ru, es or fr. Leave empty for Discord's language."), default: "" },
        skipOwnMessages: { type: "boolean", label: tx("Skip my messages"), description: tx("Do not translate your own messages"), default: true },
        channels: { type: "string", label: tx("Channels"), description: tx("Channel IDs to translate, separated by commas. /autotranslate adds or removes the one you're in."), default: "" },
    },
    start({ store, cleanup }) {
        const cache = new Map<string, AutoTranslation | null>();
        const channels = () => new Set(store.channels.split(/[\s,]+/).filter(Boolean));
        const target = () => store.targetLanguage.trim() || (getStore("LocaleStore")?.locale ?? "en").split("-")[0];
        cleanup(
            onMessageRow("message-translate", (row, message) => {
                if (!channels().has(message.channel_id) || !message.content?.trim()) return;
                if (store.skipOwnMessages && message.author?.id === currentUserId()) return;
                const cached = cache.get(message.id);
                if (cached === undefined) {
                    cache.set(message.id, null);
                    translate(message.content, target())
                        .then(result => {
                            // Already in the right language
                            if (result.from === target() || result.text.trim() === message.content.trim()) return;
                            cache.set(message.id, result);
                            redrawMessage(message.channel_id, message.id);
                        })
                        .catch(() => cache.delete(message.id));
                    return;
                }
                if (cached && Array.isArray(row.content)) row.content = [...row.content, textNode(`\n🌐 ${cached.text}`)];
            }),
            command({
                name: "autotranslate",
                description: tx("Turn automatic translation on or off for this channel"),
                run: (_, ctx) => {
                    const list = channels();
                    const on = !list.delete(ctx.channel.id);
                    if (on) list.add(ctx.channel.id);
                    store.channels = [...list].join(", ");
                    botMessage(ctx.channel.id, on ? t("Messages here will be translated.") : t("Messages here won't be translated anymore."));
                },
            }),
        );
    },
});

interface Session {
    id_hash: string;
    approx_last_used_time?: string;
    client_info?: { os?: string; platform?: string; location?: string; };
}

const sessionState = wrapSync(createStorage<{ known: string[]; names: Record<string, string>; }>(createMMKVBackend("ENDCORD_SESSIONS", { known: [], names: {} })));

function SessionsPage() {
    useProxy(sessionState);
    const [sessions, setSessions] = useState<Session[] | null>(null);
    useEffect(() => {
        api("get", "/auth/sessions").then(r => setSessions(r?.user_sessions ?? [])).catch(() => setSessions([]));
    }, []);
    return <LogList
        title={t("Devices")}
        empty={sessions === null ? t("Loading...") : t("No devices found")}
        entries={(sessions ?? []).map(s => ({
            key: s.id_hash,
            label: sessionState.names?.[s.id_hash] || [s.client_info?.platform, s.client_info?.os].filter(Boolean).join(" · ") || t("Unknown device"),
            subLabel: `${s.client_info?.location ?? ""}${s.approx_last_used_time ? ` · ${new Date(s.approx_last_used_time).toLocaleString()}` : ""}`,
            icon: "MobilePhoneIcon",
            onPress: () => {
                prompt({
                    title: t("Name This Device"),
                    initial: sessionState.names?.[s.id_hash] ?? "",
                    onSubmit: name => void (sessionState.names = { ...(sessionState.names ?? {}), [s.id_hash]: name.trim() }),
                });
            },
        }))}
    />;
}

const BetterSessions = definePlugin({
    id: "endcord.better-sessions",
    name: "BetterSessions",
    description: tx("Enhances the sessions (devices) menu. Allows you to view exact timestamps, give each session a custom name, and receive notifications about new sessions."),
    authors: [ENDCORD_AUTHOR],
    icon: "MobilePhoneIcon",
    tags: ["Privacy", "Utility"],
    settings: {
        backgroundCheck: { type: "boolean", label: tx("Watch for new logins"), description: tx("Check for new sessions in the background, and display notifications when they are detected"), default: true },
    },
    SettingsComponent: SessionsPage,
    async start({ store, cleanup }) {
        await awaitStorage(sessionState);
        const check = async () => {
            if (!store.backgroundCheck) return;
            try {
                const sessions: Session[] = (await api("get", "/auth/sessions"))?.user_sessions ?? [];
                const known = new Set(sessionState.known ?? []);
                const fresh = sessions.filter(s => !known.has(s.id_hash));
                if (known.size && fresh.length) {
                    const s = fresh[0];
                    showToast(t("New login: {device}", { device: [s.client_info?.platform, s.client_info?.os, s.client_info?.location].filter(Boolean).join(" · ") }), findAssetId("ShieldIcon"));
                }
                sessionState.known = sessions.map(s => s.id_hash);
            } catch { }
        };
        const timer = setInterval(check, 15 * 60_000);
        cleanup(() => clearInterval(timer));
        setTimeout(check, 10_000);
    },
});

export default [IRememberYou, PermissionsViewer, ExpressionCloner, LastOnline, PingNotifications, ReviewDB, CopyStatusUrls, MessageTranslate, BetterSessions];
