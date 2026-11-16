/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Adapted from Endcord PC's BypassStatus. PC shows a desktop notification for messages from the sources you chose
 * while you're on Do Not Disturb (or another status you pick); the phone shows one of Discord's toasts and plays
 * Discord's message sound, only while Discord is open, since the notifications Android shows when it's closed are
 * sent by Discord's servers. PC's right-click entries are a row in the message long-press menu here, for the
 * message's author, channel and server.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { AppState } from "react-native";

import { definePlugin } from "../api";
import { currentUserId, getStore, guildRoles, moduleAt, subscribe } from "../common";
import { addMessageAction, currentChannelId, displayName, getChannel, getGuild, getUser, playSound } from "../hooks";
import { channelName } from "../shared/channels";
import { placeOf } from "../shared/notify";
import { choose } from "../ui/dialogs";
import { idSet, popupText, shouldBypass, toggleId } from "./logic";

let statusSetting: any;

/** The status you chose: the setting itself, which says "invisible" where your presence would say offline */
function myStatus(me: string): string | undefined {
    statusSetting ??= findByProps("StatusSetting", "CustomStatusSetting")?.StatusSetting ?? findByProps("StatusSetting")?.StatusSetting;
    const chosen = statusSetting?.getSetting?.();
    return typeof chosen === "string" ? chosen : getStore("PresenceStore")?.getStatus?.(me);
}

/** Discord's own message sound, the one it plays for a message in another chat */
function playMessageSound() {
    const sounds = moduleAt("modules/sound_playback/SoundUtils.tsx");
    if (typeof sounds?.playSound === "function") sounds.playSound("message1");
    else playSound("message1");
}

type ListKey = "guilds" | "channels" | "users";

export default definePlugin({
    id: "endcord.bypass-status",
    name: "BypassStatus",
    description: tx("Still get a pop-up from chosen people, channels and servers while you're on Do Not Disturb. Long-press a message to add its author, channel or server. Only while Discord is open: notifications when it's closed come from Discord's servers."),
    icon: "BellZIcon",
    tags: ["Customisation", "Notifications", "Servers"],
    settings: {
        guilds: {
            type: "string",
            label: tx("Servers"),
            description: tx("Guilds to let bypass (notified when pinged anywhere in guild)"),
            placeholder: tx("Separate with commas"),
            default: "",
        },
        channels: {
            type: "string",
            label: tx("Channels"),
            description: tx("Channels to let bypass (notified when pinged in that channel)"),
            placeholder: tx("Separate with commas"),
            default: "",
        },
        users: {
            type: "string",
            label: tx("Users"),
            description: tx("Users to let bypass (notified for all messages sent in DMs)"),
            placeholder: tx("Separate with commas"),
            default: "",
        },
        allowOutsideOfDms: {
            type: "boolean",
            label: tx("Outside of DMs too"),
            description: tx("Allow selected users to bypass status outside of DMs too (acts like a channel/guild bypass, but it's for all messages sent by the selected users)"),
            default: false,
        },
        notificationSound: {
            type: "boolean",
            label: tx("Sound"),
            description: tx("Whether the notification sound should be played"),
            default: true,
        },
        respectSilentPings: {
            type: "boolean",
            label: tx("Respect silent pings (@silent / suppress notifications)"),
            default: true,
        },
        statusToUse: {
            type: "select",
            label: tx("Status to use for whitelist"),
            default: "dnd",
            options: [
                { label: tx("Online"), value: "online" },
                { label: tx("Idle"), value: "idle" },
                { label: tx("Do Not Disturb"), value: "dnd" },
                { label: tx("Invisible"), value: "invisible" },
            ],
        },
    },
    start({ store, cleanup }) {
        const toggle = (key: ListKey, id: string, name: string) => {
            const { list, added } = toggleId(store[key], id);
            store[key] = list;
            showToast(added ? t("{name} now gets through your status", { name }) : t("{name} no longer gets through your status", { name }), findAssetId("BellZIcon"));
        };
        // The lists read again only when they change, not for every message
        let read = { text: "", lists: { guilds: new Set<string>(), channels: new Set<string>(), users: new Set<string>() } };
        const lists = () => {
            const text = `${store.guilds}|${store.channels}|${store.users}`;
            if (text !== read.text) read = { text, lists: { guilds: idSet(store.guilds), channels: idSet(store.channels), users: idSet(store.users) } };
            return read.lists;
        };
        const entry = (key: ListKey, id: string | undefined, name: string) => id
            ? [{ label: idSet(store[key]).has(id) ? t("Remove Status Bypass for {name}", { name }) : t("Add Status Bypass for {name}", { name }), value: { key, id, name } }]
            : [];

        cleanup(
            subscribe("MESSAGE_CREATE", ({ message, guildId, optimistic }) => {
                const me = currentUserId();
                if (optimistic || !me || !message) return;
                const channel = getChannel(message.channel_id);
                const guild = guildId ?? channel?.guild_id ?? undefined;
                const sources = lists();
                // Most messages come from nowhere on the lists, and cost no more than this
                if (!sources.users.has(message.author?.id) && !sources.channels.has(message.channel_id) && !(guild && sources.guilds.has(guild))) return;
                const settings = getStore("UserGuildSettingsStore");
                const notify = shouldBypass({
                    message,
                    channel,
                    guildId: guild,
                    status: myStatus(me),
                    statusToUse: store.statusToUse,
                    viewingChannelId: AppState.currentState === "active" ? currentChannelId() : undefined,
                    lists: sources,
                    allowOutsideOfDms: store.allowOutsideOfDms,
                    respectSilentPings: store.respectSilentPings,
                    mention: {
                        me,
                        myRoles: guild ? getStore("GuildMemberStore")?.getMember?.(guild, me)?.roles ?? [] : [],
                        suppressEveryone: guild ? !!settings?.isSuppressEveryoneEnabled?.(guild) : false,
                        suppressRoles: guild ? !!settings?.isSuppressRolesEnabled?.(guild) : false,
                    },
                });
                if (!notify) return;
                const text = popupText(message.content, {
                    user: id => getUser(id) ? displayName(getUser(id)) : undefined,
                    channel: id => getChannel(id)?.name,
                    role: id => guild ? guildRoles(guild)[id]?.name : undefined,
                });
                const where = channel?.type === 1 ? "" : ` · ${placeOf(message.channel_id)}`;
                showToast(`${displayName(message.author)}${where}: ${text}`, findAssetId("BellZIcon"));
                if (store.notificationSound) playMessageSound();
            }),
            addMessageAction({
                key: "bypass-status",
                icon: "BellZIcon",
                label: () => t("Status Bypass"),
                onPress: (message, channel) => {
                    const me = currentUserId();
                    const author = message?.author;
                    const guildId = channel?.guild_id ?? undefined;
                    const choices = [
                        ...entry("users", author?.id && author.id !== me ? author.id : undefined, displayName(author)),
                        ...entry("channels", channel?.id, channel?.id ? channelName(channel.id) : ""),
                        ...entry("guilds", guildId, getGuild(guildId)?.name ?? guildId ?? ""),
                    ];
                    choose(t("Status Bypass"), choices, ({ key, id, name }) => toggle(key, id, name));
                },
            }),
        );
    },
});
