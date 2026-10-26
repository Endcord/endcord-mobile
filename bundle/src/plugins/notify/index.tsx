/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Plugins that tell you about things and act on them for you: keywords, messages, voice channels, new servers.
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { before } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { FluxDispatcher } from "@metro/common";
import { useEffect, useState } from "react";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore, onAction, subscribe } from "../common";
import { api, botMessage, command, currentChannelId, displayName, getChannel, getGuild, getUser, jumpTo, MessageActions, parseEmoji, react, send } from "../hooks";
import LogList from "../ui/LogList";

const ids = (text: string) => new Set(text.split(/[\s,]+/).filter(Boolean));
const preview = (text: string, length = 120) => {
    const flat = (text ?? "").replace(/\s+/g, " ").trim();
    return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};

/** Where a message was sent, as people would say it: "#general (Server)", "a DM", "Group name" */
function placeOf(channelId: string) {
    const channel = getChannel(channelId);
    if (!channel) return "";
    if (channel.guild_id) return `#${channel.name} (${getGuild(channel.guild_id)?.name ?? "?"})`;
    if (channel.type === 3) return channel.name || t("Group DM");
    return t("Direct Message");
}

interface Logged {
    id: string;
    channelId: string;
    author: string;
    content: string;
    at: number;
}

const keywordLog = wrapSync(createStorage<{ entries: Logged[]; }>(createMMKVBackend("ENDCORD_KEYWORD_LOG", { entries: [] })));

function KeywordLog() {
    useProxy(keywordLog);
    const entries = Array.isArray(keywordLog.entries) ? keywordLog.entries : [];
    return <LogList
        title={t("Recent Mentions")}
        empty={t("No keywords have been mentioned yet")}
        entries={entries.map(e => ({
            key: e.id,
            label: `${e.author}: ${preview(e.content, 80)}`,
            subLabel: `${placeOf(e.channelId)} · ${new Date(e.at).toLocaleString()}`,
            onPress: () => jumpTo(e.channelId, e.id),
        }))}
        onClear={() => void (keywordLog.entries = [])}
    />;
}

const KeywordNotify = definePlugin({
    id: "endcord.keyword-notify",
    name: "KeywordNotify",
    description: tx("Sends a notification if a given message matches certain keywords or regexes"),
    authors: [ENDCORD_AUTHOR],
    icon: "BellIcon",
    tags: ["Notifications"],
    settings: {
        keywords: { type: "string", label: tx("Keywords"), description: tx("Comma-separated words or phrases to watch for"), default: "" },
        useRegex: { type: "boolean", label: tx("Regular expressions"), description: tx("Treat each keyword as a regular expression"), default: false },
        ignoreBots: { type: "boolean", label: tx("Ignore bots"), description: tx("Ignore messages from bots"), default: true },
        amountToKeep: { type: "number", label: tx("Messages to keep"), description: tx("Amount of messages to keep in the log"), default: 50, min: 1, max: 500 },
    },
    SettingsComponent: KeywordLog,
    async start({ store, cleanup }) {
        await awaitStorage(keywordLog);
        const matches = (text: string) => {
            const words = store.keywords.split(",").map(w => w.trim()).filter(Boolean);
            return words.some(w => {
                if (!store.useRegex) return text.toLowerCase().includes(w.toLowerCase());
                try {
                    return new RegExp(w, "i").test(text);
                } catch {
                    return false;
                }
            });
        };
        cleanup(subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
            if (optimistic || !message?.content || message.author?.id === currentUserId()) return;
            if (store.ignoreBots && message.author?.bot) return;
            if (!matches(message.content)) return;
            const author = displayName(message.author);
            const entry = { id: message.id, channelId: message.channel_id, author, content: message.content, at: Date.now() };
            keywordLog.entries = [entry, ...(keywordLog.entries ?? [])].slice(0, store.amountToKeep);
            if (message.channel_id !== currentChannelId()) {
                showToast(`${author} · ${placeOf(message.channel_id)}: ${preview(message.content, 80)}`, findAssetId("BellIcon"));
            }
        }));
    },
});

const ToastNotifications = definePlugin({
    id: "endcord.toast-notifications",
    name: "ToastNotifications",
    description: tx("Show a pop-up toast notification, configurable for DMs, group, friends, or guild channels."),
    authors: [ENDCORD_AUTHOR],
    icon: "BellIcon",
    tags: ["Notifications"],
    settings: {
        directMessages: { type: "boolean", label: tx("Direct messages"), description: tx("Show notifications for direct messages."), default: true },
        groupMessages: { type: "boolean", label: tx("Group messages"), description: tx("Show notifications for group messages."), default: true },
        friendServerNotifications: { type: "boolean", label: tx("Friends in servers"), description: tx("Show notifications when friends send messages in servers they share with you."), default: false },
        respectDoNotDisturb: { type: "boolean", label: tx("Respect Do Not Disturb"), description: tx("Do not show notifications when your status is Do Not Disturb."), default: true },
        ignoreUsers: { type: "string", label: tx("Ignored users"), description: tx("A list of user IDs (separate by commas) to ignore displaying notifications for."), default: "" },
        notifyFor: { type: "string", label: tx("Always notify for"), description: tx("A list of channel IDs (separate by commas) to always receive notifications from."), default: "" },
    },
    start({ store, cleanup }) {
        cleanup(subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
            const me = currentUserId();
            const author = message?.author;
            if (optimistic || !author || author.id === me || message.channel_id === currentChannelId()) return;
            if (ids(store.ignoreUsers).has(author.id)) return;
            if (store.respectDoNotDisturb && getStore("PresenceStore")?.getStatus?.(me) === "dnd") return;
            const channel = getChannel(message.channel_id);
            const always = ids(store.notifyFor).has(message.channel_id);
            const wanted = always
                || channel?.type === 1 && store.directMessages
                || channel?.type === 3 && store.groupMessages
                || channel?.guild_id && store.friendServerNotifications && getStore("RelationshipStore")?.isFriend?.(author.id);
            if (!wanted) return;
            const body = message.content || (message.attachments?.length ? t("Sent an attachment") : message.sticker_items?.length ? t("Sent a sticker") : "");
            showToast(`${displayName(author)}${channel?.guild_id || channel?.type === 3 ? ` · ${placeOf(message.channel_id)}` : ""}: ${preview(body, 90)}`, findAssetId("ChatIcon"));
        }));
    },
});

const VoiceJoinMessages = definePlugin({
    id: "endcord.voice-join-messages",
    name: "VoiceJoinMessages",
    description: tx("Receive client-side ephemeral messages when your friends join voice channels"),
    authors: [ENDCORD_AUTHOR],
    icon: "VoiceNormalIcon",
    tags: ["Voice", "Friends", "Notifications"],
    settings: {
        friendDirectMessagesShowMemberCount: { type: "boolean", label: tx("Show member count"), description: tx("Show the count of other members in the voice channel when receiving a DM notification of your friend joining a voice channel"), default: true },
        friendDirectMessagesSelf: { type: "boolean", label: tx("Even in my channel"), description: tx("Receive notifications in your friends' DMs even if you are in the same voice channel as them"), default: false },
        allowedFriends: { type: "string", label: tx("Only these friends"), description: tx("Comma or space separated list of friends' user IDs you want to recieve join messages from"), default: "" },
        ignoredFriends: { type: "string", label: tx("Ignored friends"), description: tx("Comma or space separated list of friends' user IDs you do NOT want to recieve join messages from"), default: "" },
    },
    start({ store, cleanup }) {
        cleanup(onAction<{ voiceStates: any[]; }>("VOICE_STATE_UPDATES", ({ voiceStates }) => {
            const voiceStore = getStore("VoiceStateStore");
            const myChannel = getStore("SelectedChannelStore")?.getVoiceChannelId?.();
            for (const state of voiceStates ?? []) {
                const { userId, channelId } = state;
                if (!channelId || userId === currentUserId()) continue;
                if (!getStore("RelationshipStore")?.isFriend?.(userId)) continue;
                const allowed = ids(store.allowedFriends);
                if (allowed.size && !allowed.has(userId) || ids(store.ignoredFriends).has(userId)) continue;
                const previous = voiceStore?.getVoiceStateForUser?.(userId)?.channelId;
                if (previous === channelId) continue;
                if (!store.friendDirectMessagesSelf && channelId === myChannel) continue;
                const dm = getStore("ChannelStore")?.getDMFromUserId?.(userId);
                if (!dm) continue;
                const others = Object.keys(voiceStore?.getVoiceStatesForChannel?.(channelId) ?? {}).filter(id => id !== userId).length;
                const count = store.friendDirectMessagesShowMemberCount && others ? ` ${t("with {count} others", { count: others })}` : "";
                const vars = { user: `**${displayName(getUser(userId))}**`, channel: `<#${channelId}>` };
                const text = previous ? t("{user} moved to {channel}", vars) : t("{user} joined {channel}", vars);
                setTimeout(() => botMessage(dm, `🔊 ${text}${count}`), 0);
            }
        }));
    },
});

interface VoiceEvent {
    key: string;
    text: string;
    channelId: string;
    at: number;
}

const voiceLog: VoiceEvent[] = [];
let notifyVoiceLog: (() => void) | undefined;

function VoiceLog() {
    const [, setTick] = useState(0);
    useEffect(() => {
        notifyVoiceLog = () => setTick(n => n + 1);
        return () => void (notifyVoiceLog = undefined);
    }, []);
    return <LogList
        title={t("Voice Activity")}
        empty={t("Nothing has happened in voice channels yet")}
        entries={[...voiceLog].reverse().map(e => ({ key: e.key, label: e.text, subLabel: new Date(e.at).toLocaleTimeString() }))}
        onClear={() => {
            voiceLog.length = 0;
            notifyVoiceLog?.();
        }}
    />;
}

const VoiceChannelLog = definePlugin({
    id: "endcord.voice-channel-log",
    name: "VoiceChannelLog",
    description: tx("Logs voice channel activity: joins, leaves, moves, server mutes, cameras and screen shares"),
    authors: [ENDCORD_AUTHOR],
    icon: "VoiceNormalIcon",
    tags: ["Voice"],
    settings: {
        logJoinLeave: { type: "boolean", label: tx("Joins and leaves"), description: tx("Log when users join, leave, or move between voice channels."), default: true },
        logMuteDeafen: { type: "boolean", label: tx("Server mutes and deafens"), description: tx("Log when users are server muted or deafened."), default: true },
        logVideo: { type: "boolean", label: tx("Cameras"), description: tx("Log when users turn their camera on or off."), default: true },
        logStream: { type: "boolean", label: tx("Screen shares"), description: tx("Log when users start or stop screensharing."), default: true },
        ignoreBlockedUsers: { type: "boolean", label: tx("Ignore blocked users"), description: tx("Do not log blocked users."), default: true },
        toasts: { type: "boolean", label: tx("Toasts for my channel"), description: tx("Also show a toast when something happens in the voice channel you're in"), default: true },
    },
    SettingsComponent: VoiceLog,
    start({ store, cleanup }) {
        cleanup(() => void (voiceLog.length = 0), onAction<{ voiceStates: any[]; }>("VOICE_STATE_UPDATES", ({ voiceStates }) => {
            const voiceStore = getStore("VoiceStateStore");
            const myChannel = getStore("SelectedChannelStore")?.getVoiceChannelId?.();
            for (const state of voiceStates ?? []) {
                if (store.ignoreBlockedUsers && getStore("RelationshipStore")?.isBlocked?.(state.userId)) continue;
                const before = voiceStore?.getVoiceStateForUser?.(state.userId);
                const name = displayName(getUser(state.userId) ?? { id: state.userId });
                const channelName = (id?: string | null) => id ? `#${getChannel(id)?.name ?? "?"}` : "";
                const events: string[] = [];
                if (store.logJoinLeave && before?.channelId !== state.channelId) {
                    if (!before?.channelId) events.push(t("{user} joined {channel}", { user: name, channel: channelName(state.channelId) }));
                    else if (!state.channelId) events.push(t("{user} left {channel}", { user: name, channel: channelName(before.channelId) }));
                    else events.push(t("{user} moved from {from} to {to}", { user: name, from: channelName(before.channelId), to: channelName(state.channelId) }));
                }
                if (before?.channelId && before.channelId === state.channelId) {
                    if (store.logMuteDeafen && !!before.mute !== !!state.mute) events.push(state.mute ? t("{user} was server muted", { user: name }) : t("{user} was server unmuted", { user: name }));
                    if (store.logMuteDeafen && !!before.deaf !== !!state.deaf) events.push(state.deaf ? t("{user} was server deafened", { user: name }) : t("{user} was server undeafened", { user: name }));
                    if (store.logVideo && !!before.selfVideo !== !!state.selfVideo) events.push(state.selfVideo ? t("{user} turned on their camera", { user: name }) : t("{user} turned off their camera", { user: name }));
                    if (store.logStream && !!before.selfStream !== !!state.selfStream) events.push(state.selfStream ? t("{user} started sharing their screen", { user: name }) : t("{user} stopped sharing their screen", { user: name }));
                }
                for (const text of events) {
                    voiceLog.push({ key: `${Date.now()}-${voiceLog.length}`, text, channelId: state.channelId ?? before?.channelId, at: Date.now() });
                    if (voiceLog.length > 200) voiceLog.shift();
                    const involvesMine = myChannel && (state.channelId === myChannel || before?.channelId === myChannel);
                    if (store.toasts && involvesMine && state.userId !== currentUserId()) showToast(text, findAssetId("VoiceNormalIcon"));
                }
                if (events.length) notifyVoiceLog?.();
            }
        }));
    },
});

/** "keyword = emoji" lines */
function parseRules(text: string) {
    return text.split("\n").flatMap(line => {
        const index = line.lastIndexOf("=");
        if (index <= 0) return [];
        const keyword = line.slice(0, index).trim().toLowerCase();
        const emoji = parseEmoji(line.slice(index + 1));
        return keyword && emoji ? [{ keyword, emoji }] : [];
    });
}

const AutoReact = definePlugin({
    id: "endcord.auto-react",
    name: "AutoReact",
    description: tx("Automatically react to messages containing specific keywords."),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Chat", "Emotes", "Fun"],
    settings: {
        rules: {
            type: "string",
            label: tx("Rules"),
            description: tx("One per line: keyword = emoji. Custom emojis are written as <:name:id>."),
            placeholder: "gg = 🎉",
            multiline: true,
            default: "",
        },
        reactToSelf: { type: "boolean", label: tx("React to my messages too"), description: tx("Also react to the messages you send"), default: false },
        channels: { type: "string", label: tx("Only in these channels"), description: tx("Channel IDs separated by commas; empty means everywhere"), default: "" },
    },
    start({ store, cleanup }) {
        // Reactions are queued so a busy chat doesn't hit Discord's rate limit
        const queue: Array<() => void> = [];
        const timer = setInterval(() => queue.shift()?.(), 400);
        cleanup(() => clearInterval(timer), subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
            if (optimistic || !message?.content) return;
            if (!store.reactToSelf && message.author?.id === currentUserId()) return;
            const only = ids(store.channels);
            if (only.size && !only.has(message.channel_id)) return;
            const content = message.content.toLowerCase();
            for (const { keyword, emoji } of parseRules(store.rules)) {
                if (content.includes(keyword)) queue.push(() => react(message.channel_id, message.id, emoji));
            }
        }));
    },
});

const NewGuildSettings = definePlugin({
    id: "endcord.new-guild-settings",
    name: "NewGuildSettings",
    description: tx("Automatically mute new servers and change various other settings upon joining"),
    authors: [ENDCORD_AUTHOR],
    icon: "ServerIcon",
    tags: ["Servers", "Notifications"],
    settings: {
        guild: { type: "boolean", label: tx("Mute the server"), description: tx("Mute Guild automatically"), default: true },
        everyone: { type: "boolean", label: tx("Suppress @everyone and @here"), description: tx("Suppress @everyone and @here"), default: true },
        role: { type: "boolean", label: tx("Suppress role mentions"), description: tx("Suppress All Role @mentions"), default: true },
        highlights: { type: "boolean", label: tx("Suppress highlights"), description: tx("Suppress Highlights automatically"), default: true },
        events: { type: "boolean", label: tx("Mute new events"), description: tx("Mute New Events automatically"), default: true },
        messages: {
            type: "select",
            label: tx("Server Notification Settings"),
            default: "3",
            options: [
                { label: tx("All messages"), value: "0" },
                { label: tx("Only @mentions"), value: "1" },
                { label: tx("Nothing"), value: "2" },
                { label: tx("Server default"), value: "3" },
            ],
        },
    },
    start({ store, cleanup }) {
        const apply = (guildId?: string | null) => {
            const settings = findByProps("updateGuildNotificationSettings");
            if (!guildId || !settings) return;
            settings.updateGuildNotificationSettings(guildId, {
                muted: store.guild,
                suppress_everyone: store.everyone,
                suppress_roles: store.role,
                mute_scheduled_events: store.events,
                notify_highlights: store.highlights ? 1 : 0,
            });
            if (store.messages !== "3") settings.updateGuildNotificationSettings(guildId, { message_notifications: Number(store.messages) });
        };
        const applied = new Set<string>();
        const once = (guildId?: string | null) => {
            if (!guildId || applied.has(guildId)) return;
            applied.add(guildId);
            setTimeout(() => apply(guildId), 1500);
        };
        cleanup(
            subscribe("GUILD_CREATE", ({ guild }) => {
                const joined = Date.parse(guild?.joined_at ?? guild?.joinedAt ?? "");
                if (Date.now() - joined < 2 * 60_000) once(guild.id);
            }),
            subscribe("INVITE_ACCEPT_SUCCESS", ({ invite }) => once(invite?.guild?.id ?? invite?.guild_id)),
            subscribe("GUILD_JOIN_REQUEST_UPDATE", ({ guildId, request, status }) => {
                if (status === "APPROVED" && request?.user_id === currentUserId()) once(guildId);
            }),
            command({
                name: "newguildsettings",
                description: tx("Apply NewGuildSettings to this server now"),
                run: (_, ctx) => {
                    if (!ctx.channel.guild_id) {
                        botMessage(ctx.channel.id, t("This only works in a server."));
                        return;
                    }
                    apply(ctx.channel.guild_id);
                    botMessage(ctx.channel.id, t("Applied NewGuildSettings to this server."));
                },
            }),
        );
    },
});

const AntiNickname = definePlugin({
    id: "endcord.anti-nickname",
    name: "AntiNickname",
    description: tx("Automatically resets any nickname forcefully assigned to you in a server. Works even without admin permissions."),
    authors: [ENDCORD_AUTHOR],
    icon: "IdIcon",
    tags: ["Servers", "Customisation"],
    settings: {
        showToast: { type: "boolean", label: tx("Tell me"), description: tx("Show a notification when a forced nickname is removed"), default: true },
    },
    start({ store, cleanup }) {
        const resetting = new Set<string>();
        const reset = async (guildId: string, nick: string) => {
            if (resetting.has(guildId)) return;
            resetting.add(guildId);
            try {
                try {
                    await api("patch", `/users/@me/guilds/${guildId}/profile`, { nick: null });
                } catch {
                    await api("patch", `/guilds/${guildId}/members/@me`, { nick: "" });
                }
                if (store.showToast) showToast(t("AntiNickname: nickname \"{nick}\" removed", { nick }), findAssetId("CheckmarkLargeIcon"));
            } catch (e: any) {
                if (store.showToast) showToast(t("AntiNickname: couldn't reset nickname ({status})", { status: e?.status ?? "?" }), findAssetId("CircleXIcon-primary"));
            } finally {
                setTimeout(() => resetting.delete(guildId), 2000);
            }
        };
        cleanup(subscribe("GUILD_MEMBER_UPDATE", ({ guildId, user, nick }) => {
            if (user?.id !== currentUserId() || !nick) return;
            setTimeout(() => reset(guildId, nick), 300);
        }));
    },
});

/** Marks every server channel and thread with unread messages as read */
export function readAll() {
    const guilds = Object.values<any>(getStore("GuildStore")?.getGuilds?.() ?? {});
    const readStates = getStore("ReadStateStore");
    const guildChannels = getStore("GuildChannelStore");
    const threads = getStore("ActiveJoinedThreadsStore");
    const channels: any[] = [];
    for (const guild of guilds) {
        const all = guildChannels?.getChannels?.(guild.id) ?? {};
        const list = [...(all.SELECTABLE ?? []), ...(all.VOCAL ?? [])].map((c: any) => c.channel?.id);
        for (const group of Object.values<any>(threads?.getActiveJoinedThreadsForGuild?.(guild.id) ?? {})) {
            for (const thread of Object.values<any>(group)) list.push(thread?.channel?.id);
        }
        for (const id of list) {
            if (id && readStates?.hasUnread?.(id)) channels.push({ channelId: id, messageId: readStates.lastMessageId(id), readStateType: 0 });
        }
    }
    if (channels.length) FluxDispatcher.dispatch({ type: "BULK_ACK", context: "APP", channels });
    return channels.length;
}

const ReadAllNotificationsButton = definePlugin({
    id: "endcord.read-all-notifications",
    name: "ReadAllNotificationsButton",
    description: tx("Mark every server as read at once with /readall"),
    authors: [ENDCORD_AUTHOR],
    icon: "CheckmarkLargeIcon",
    tags: ["Notifications", "Servers"],
    start({ cleanup }) {
        cleanup(command({
            name: "readall",
            description: tx("Mark every server as read"),
            run: (_, ctx) => {
                const count = readAll();
                botMessage(ctx.channel.id, count ? t("Marked {count} channels as read.", { count }) : t("Everything is already read."));
            },
        }));
    },
});

interface Protected {
    channelId: string;
    guildId?: string;
    content: string;
}

const AntiDeleteMessage = definePlugin({
    id: "endcord.anti-delete-message",
    name: "AntiDeleteMessage",
    description: tx("Automatically resends your messages if someone deletes them. Cache persisted across restarts."),
    authors: [ENDCORD_AUTHOR],
    icon: "ShieldIcon",
    tags: ["Chat", "Utility"],
    settings: {
        enabled: { type: "boolean", label: tx("Resend deleted messages"), description: tx("Enable automatic message restoration"), default: true },
        dmProtection: { type: "boolean", label: tx("In DMs too"), description: tx("Also protect DMs (not just servers)"), default: false },
        maxCacheSize: { type: "number", label: tx("Messages to remember"), description: tx("Maximum number of messages kept in cache"), default: 300, min: 10, max: 5000 },
        serverBlacklist: { type: "string", label: tx("Servers to skip"), description: tx("Server IDs to ignore (comma-separated). Messages sent in these servers will NOT be resent."), default: "" },
    },
    async start({ store, cleanup }) {
        const cache = wrapSync(createStorage<{ messages: Record<string, Protected>; }>(createMMKVBackend("ENDCORD_ANTI_DELETE", { messages: {} })));
        await awaitStorage(cache);
        const deletedByMe = new Set<string>();
        const actions = MessageActions();
        if (typeof actions?.deleteMessage === "function") {
            cleanup(before("deleteMessage", actions, ([, messageId]: any[]) => void deletedByMe.add(messageId)));
        }
        cleanup(
            subscribe("MESSAGE_CREATE", ({ message, guildId, optimistic }) => {
                if (optimistic || message?.author?.id !== currentUserId() || !message.content) return;
                const guild = guildId ?? message.guild_id ?? getChannel(message.channel_id)?.guild_id;
                if (!guild && !store.dmProtection) return;
                const messages: Record<string, Protected> = { ...(cache.messages ?? {}), [message.id]: { channelId: message.channel_id, guildId: guild, content: message.content } };
                const keys = Object.keys(messages);
                for (const key of keys.slice(0, Math.max(0, keys.length - store.maxCacheSize))) delete messages[key];
                cache.messages = messages;
            }),
            onAction<{ id: string; channelId: string; endcordLocal?: boolean; }>("MESSAGE_DELETE", ({ id, channelId, endcordLocal }) => {
                const saved = cache.messages?.[id];
                if (!saved || !store.enabled || endcordLocal) return;
                const { [id]: _, ...rest } = cache.messages;
                cache.messages = rest;
                if (deletedByMe.delete(id) || saved.guildId && ids(store.serverBlacklist).has(saved.guildId)) return;
                setTimeout(() => send(channelId ?? saved.channelId, saved.content), 500);
            }, { first: true }),
        );
    },
});

export default [KeywordNotify, ToastNotifications, VoiceJoinMessages, VoiceChannelLog, AutoReact, NewGuildSettings, AntiNickname, ReadAllNotificationsButton, AntiDeleteMessage];
