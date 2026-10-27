/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { botMessage, command, getUser, localSnowflake, receiveLocalMessage } from "../hooks";
import { rawUser } from "../shared/tools";

export default definePlugin({
    id: "endcord.fake-message",
    name: "FakeMessage",
    description: tx("Send a client-side fake message posed as any user via /fakemsg. Only you can see it."),
    icon: "ChatIcon",
    tags: ["Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "fakemsg",
            description: tx("Show a message from someone that only you can see"),
            options: [
                { name: "user", description: tx("Who it's from"), type: "user", required: true },
                { name: "message", description: tx("What it says"), required: true },
            ],
            run: ({ user: userId, message }, ctx) => {
                const user = getUser(userId);
                if (!user) {
                    botMessage(ctx.channel.id, t("Couldn't find that user."));
                    return;
                }
                receiveLocalMessage(ctx.channel.id, {
                    id: localSnowflake(),
                    channel_id: ctx.channel.id,
                    guild_id: ctx.channel.guild_id,
                    author: rawUser(user),
                    content: String(message),
                    timestamp: new Date().toISOString(),
                    edited_timestamp: null,
                    type: 0,
                    flags: 0,
                    tts: false,
                    mention_everyone: false,
                    mentions: [],
                    mention_roles: [],
                    attachments: [],
                    embeds: [],
                    reactions: [],
                    pinned: false,
                    state: "SENT",
                });
            },
        }));
    },
});
