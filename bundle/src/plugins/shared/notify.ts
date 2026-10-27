/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Plugins that tell you about things and act on them for you: keywords, messages, voice channels, new servers.
 *
 * What more than one of the KeywordNotify, ToastNotifications, VoiceJoinMessages, AutoReact, ReadAllNotificationsButton and AntiDeleteMessage plugins uses.
 */

import { t } from "@core/i18n";
import { FluxDispatcher } from "@metro/common";

import { getStore } from "../common";
import { getChannel, getGuild } from "../hooks";

export const ids = (text: string) => new Set(text.split(/[\s,]+/).filter(Boolean));

export const preview = (text: string, length = 120) => {
    const flat = (text ?? "").replace(/\s+/g, " ").trim();
    return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};

/** Where a message was sent, as people would say it: "#general (Server)", "a DM", "Group name" */
export function placeOf(channelId: string) {
    const channel = getChannel(channelId);
    if (!channel) return "";
    if (channel.guild_id) return `#${channel.name} (${getGuild(channel.guild_id)?.name ?? "?"})`;
    if (channel.type === 3) return channel.name || t("Group DM");
    return t("Direct Message");
}

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
