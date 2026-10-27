/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore, guildRoles } from "../common";
import { onMessageRow } from "../hooks";
import { prependToTimestamp } from "../shared/rows";

function highestRole(guildId: string, userId: string) {
    const member = getStore("GuildMemberStore")?.getMember?.(guildId, userId);
    const roles = guildRoles(guildId);
    return (member?.roles ?? [])
        .map((id: string) => roles[id])
        .filter((r: any) => r && !r.managed)
        .sort((a: any, b: any) => b.position - a.position)[0];
}

export default definePlugin({
    id: "endcord.show-roles-in-chat",
    name: "ShowRolesInChat",
    description: tx("Shows a user's highest role next to their name in chat messages"),
    icon: "ShieldIcon",
    tags: ["Chat", "Servers"],
    settings: {
        showBots: { type: "boolean", label: tx("Bots too"), description: tx("Whether to show the highest role on bots."), default: false },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("show-roles-in-chat", (row, message) => {
            const guildId = getStore("ChannelStore")?.getChannel?.(message.channel_id)?.guild_id;
            if (!guildId || !message.author?.id || !store.showBots && message.author.bot) return;
            const role = highestRole(guildId, message.author.id);
            if (role?.name) prependToTimestamp(row, `${role.name} · `);
        }));
    },
});
