/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { botMessage, command } from "../hooks";

export default definePlugin({
    id: "endcord.server-search",
    name: "ServerSearch",
    description: tx("Find a server by name with /servers and open it from the result"),
    icon: "MagnifyingGlassIcon",
    tags: ["Servers", "Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "servers",
            description: tx("Find your servers by name (only you see it)"),
            options: [{ name: "name", description: tx("Part of the server's name"), required: true }],
            run: ({ name }, ctx) => {
                const query = String(name).toLowerCase();
                const found = Object.values<any>(getStore("GuildStore")?.getGuilds?.() ?? {}).filter(g => g.name?.toLowerCase().includes(query)).slice(0, 20);
                botMessage(ctx.channel.id, found.length
                    ? found.map(g => `**${g.name}** · ${getStore("GuildMemberCountStore")?.getMemberCount?.(g.id) ?? "?"} ${t("members")}\nhttps://discord.com/channels/${g.id}`).join("\n")
                    : t("No server matches \"{name}\".", { name }));
            },
        }));
    },
});
