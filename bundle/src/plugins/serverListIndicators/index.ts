/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore } from "../common";
import { botMessage, command } from "../hooks";

export default definePlugin({
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
