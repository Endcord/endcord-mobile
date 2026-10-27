/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { currentUserId } from "../common";
import { api, botMessage, command, displayName, getUser, jumpTo, loadedMessages } from "../hooks";

export default definePlugin({
    id: "endcord.last-active",
    name: "LastActive",
    description: tx("Jump to the last message of yourself or someone else in a chat with /lastactive"),
    icon: "ClockIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(command({
            name: "lastactive",
            description: tx("Jump to someone's last message here"),
            options: [{ name: "user", description: tx("Whose message (defaults to you)"), type: "user" }],
            run: async ({ user }, ctx) => {
                const userId = user ?? currentUserId();
                const channelId = ctx.channel.id;
                const loaded = [...loadedMessages(channelId)].reverse().find(m => m.author?.id === userId);
                if (loaded) return void jumpTo(channelId, loaded.id);
                const guildId = ctx.channel.guild_id;
                const url = guildId
                    ? `/guilds/${guildId}/messages/search?author_id=${userId}&channel_id=${channelId}`
                    : `/channels/${channelId}/messages/search?author_id=${userId}`;
                const result = await api("get", url);
                const found = result?.messages?.[0]?.[0] ?? result?.messages?.[0];
                if (found?.id) jumpTo(channelId, found.id);
                else botMessage(channelId, t("No messages from {user} here.", { user: displayName(getUser(userId) ?? { id: userId }) }));
            },
        }));
    },
});
